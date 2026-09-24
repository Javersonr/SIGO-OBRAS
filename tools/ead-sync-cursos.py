# -*- coding: utf-8 -*-
"""Sincroniza a pasta de entrega dos cursos (Downloads) com o EAD do SIGO.

Uso (na raiz do repositório):
  py -3 tools/ead-sync-cursos.py cargas
  py -3 tools/ead-sync-cursos.py expandido  --empresa sinergia
  py -3 tools/ead-sync-cursos.py apostilas  --empresa sinergia
  py -3 tools/ead-sync-cursos.py expandido  --empresa eletro --copiar-de sinergia
  py -3 tools/ead-sync-cursos.py apostilas  --empresa eletro --copiar-de sinergia
  py -3 tools/ead-sync-cursos.py reciclagem --empresa sinergia

Subcomandos:
  cargas      grava as cargas horárias oficiais (MTE) nos 5 cursos das 2 empresas
  expandido   troca as aulas do NR-10 Básico pelos 15 módulos expandidos da pasta
              (+ apostila PDF como 1ª aula, leitura obrigatória)
  apostilas   adiciona os guias PDF (SEP/NR-35/NR-6/NR-1) como 1ª aula dos cursos
  reciclagem  cria NR-10 Básico/SEP/NR-35 "Reciclagem (8h)" com o mesmo material
  --copiar-de copia os arquivos no próprio servidor a partir da outra empresa,
              em vez de subir da pasta de novo

Nunca apaga arquivo do Storage; aulas substituídas ficam com deleted_at.
"""
import argparse
import json
import re
import subprocess
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

RAIZ_REPO = Path(__file__).resolve().parents[1]
PASTA_ENTREGA = Path(r"C:\Users\javer\Downloads\Cursos_Sinergia_Entrega_2026-09-23")
PROJECT_REF = "fpyvdwpvxrubrkdwrqbs"
SUPABASE_URL = f"https://{PROJECT_REF}.supabase.co"

EMPRESAS = {
    "sinergia": "00000000-695c-339e-bec0-d89449ec981c",
    "eletro": "00000000-6973-d889-2807-2b0fa77cf5a9",
}

# carga horária oficial (h) por código de curso — exigência do programa MTE
CARGAS = {"NR-10 BÁSICO": 40, "NR-10 SEP": 40, "NR-35": 8, "NR-06": 4, "NR-01": 4}

# guias PDF da pasta 00_ESTRUTURA_CONSOLIDADA → curso, slug e leitura mínima (min)
GUIAS = [
    ("GUIA_SEP_RASCUNHO.pdf", "NR-10 SEP", "nr10-sep", 30),
    ("GUIA_NR35_RASCUNHO.pdf", "NR-35", "nr35-altura", 20),
    ("GUIA_NR6_RASCUNHO.pdf", "NR-06", "nr06-epi", 15),
    ("GUIA_NR1_RASCUNHO.pdf", "NR-01", "nr01-integracao", 15),
]

APOSTILA_BASICO_MIN = 60  # leitura mínima da apostila do NR-10 Básico
RECICLAGENS = ["NR-10 BÁSICO", "NR-10 SEP", "NR-35"]

TMP = RAIZ_REPO / "tools" / ".tmp-ead"


def db(sql):
    # sempre via arquivo: acentos na linha de comando do Windows corrompem
    TMP.mkdir(parents=True, exist_ok=True)
    arq = TMP / "_consulta.sql"
    arq.write_text(sql, encoding="utf-8")
    r = subprocess.run(["supabase", "db", "query", "--linked", "-f", str(arq)], cwd=RAIZ_REPO,
                       capture_output=True, text=True, encoding="utf-8", shell=True)
    out = r.stdout
    if "{" not in out:
        raise SystemExit("ERRO db: " + (r.stderr or out)[:600])
    return json.loads(out[out.index("{"):])["rows"]


def db_arquivo(caminho):
    r = subprocess.run(["supabase", "db", "query", "--linked", "-f", str(caminho)], cwd=RAIZ_REPO,
                       capture_output=True, text=True, encoding="utf-8", shell=True)
    if "ERROR" in (r.stdout + r.stderr):
        raise SystemExit("ERRO sql: " + (r.stdout + r.stderr)[:900])


def q(texto):
    s = "" if texto is None else str(texto)
    assert "$t$" not in s
    return f"$t${s}$t$"


def subir(origem: Path, destino: str, content_type: str):
    rel = origem.resolve().relative_to(RAIZ_REPO) if str(origem).startswith(str(RAIZ_REPO)) else Path(
        "../" ) / origem.resolve().relative_to(RAIZ_REPO.parent)
    r = subprocess.run(
        ["supabase", "storage", "cp", str(rel).replace("\\", "/"), f"ss:///treinamentos/{destino}",
         "--content-type", content_type, "--experimental"],
        cwd=RAIZ_REPO, capture_output=True, text=True, encoding="utf-8", errors="replace")
    saida = r.stdout + r.stderr
    if r.returncode != 0 and "KeyAlreadyExists" not in saida:
        raise SystemExit(f"ERRO upload {origem.name}: {saida[-300:]}")
    return "existia" if "KeyAlreadyExists" in saida else "subiu"


def chave_service():
    r = subprocess.run(["supabase", "projects", "api-keys", "--project-ref", PROJECT_REF, "-o", "json"],
                       cwd=RAIZ_REPO, capture_output=True, text=True, encoding="utf-8", shell=True)
    return next(k["api_key"] for k in json.loads(r.stdout) if k.get("name") == "service_role")


def copiar_objeto(service, origem, destino):
    corpo = json.dumps({"bucketId": "treinamentos", "sourceKey": origem, "destinationKey": destino}).encode()
    req = urllib.request.Request(f"{SUPABASE_URL}/storage/v1/object/copy", data=corpo, method="POST",
                                 headers={"Authorization": f"Bearer {service}", "apikey": service,
                                          "Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=120).read()
        return "copiou"
    except urllib.error.HTTPError as e:
        det = e.read().decode(errors="replace")
        if "already exists" in det:
            return "existia"
        raise SystemExit(f"ERRO copiar {origem}: {e.code} {det[:200]}")


def srt_para_vtt(texto):
    corpo = texto.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n").strip()
    corpo = re.sub(r"(\d{2}:\d{2}:\d{2}),(\d{3})", r"\1.\2", corpo)
    return "WEBVTT\n\n" + corpo + "\n"


def sem_acento(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in s)


def curso_id(empresa_id, codigo):
    rows = db(f"select id from treinamento_curso where empresa_id='{empresa_id}' "
              f"and codigo={q(codigo)} and deleted_at is null")
    if not rows:
        raise SystemExit(f"Curso {codigo} não existe na empresa {empresa_id}")
    return rows[0]["id"]


def executar_sql(linhas, nome):
    TMP.mkdir(parents=True, exist_ok=True)
    arq = TMP / f"{nome}.sql"
    arq.write_text("begin;\n" + "\n".join(linhas) + "\ncommit;\n", encoding="utf-8")
    db_arquivo(arq)


# ----------------------------------------------------------------- subcomandos
def cmd_cargas(_args):
    linhas = []
    for codigo, horas in CARGAS.items():
        for emp in EMPRESAS.values():
            linhas.append(f"update treinamento_curso set carga_horaria_horas={horas} "
                          f"where empresa_id='{emp}' and codigo={q(codigo)} and deleted_at is null;")
    executar_sql(linhas, "cargas")
    for r in db("select e.nome, c.codigo, c.carga_horaria_horas from treinamento_curso c "
                "join empresa e on e.id=c.empresa_id where c.codigo in "
                "('NR-10 BÁSICO','NR-10 SEP','NR-35','NR-06','NR-01') and c.deleted_at is null "
                "order by e.nome, c.codigo"):
        print(f"  {r['nome']}: {r['codigo']} = {r['carga_horaria_horas']}h")


def preparar_vtt(srt: Path, nome_local: str) -> Path:
    TMP.mkdir(parents=True, exist_ok=True)
    destino = TMP / nome_local
    destino.write_text(srt_para_vtt(srt.read_text(encoding="utf-8-sig")), encoding="utf-8", newline="\n")
    return destino


def cmd_expandido(args):
    emp = EMPRESAS[args.empresa]
    pasta = PASTA_ENTREGA / "NR10_Basico_Expandido_Rascunho"
    manifesto = json.loads((pasta / "manifesto.json").read_text(encoding="utf-8"))
    cid = curso_id(emp, "NR-10 BÁSICO")
    prefixo = f"{emp}/ead/nr10-basico/expandido"
    apostila_dest = f"{emp}/ead/nr10-basico/apostila_leitura.pdf"
    service = chave_service() if args.copiar_de else None
    origem_emp = EMPRESAS[args.copiar_de] if args.copiar_de else None

    itens = []  # (ordem, titulo, video_ref, legenda_ref, duracao)
    for n, m in enumerate(manifesto, start=2):
        nome = sem_acento(Path(m["file"]).stem)
        vdest = f"{prefixo}/{n - 1:02d}_{nome}.mp4"
        ldest = f"{prefixo}/{n - 1:02d}_{nome}.vtt"
        if args.copiar_de:
            o = vdest.replace(emp, origem_emp, 1)
            print(" ", copiar_objeto(service, o, vdest), vdest.rsplit('/', 1)[-1], flush=True)
            copiar_objeto(service, ldest.replace(emp, origem_emp, 1), ldest)
        else:
            print(" ", subir(pasta / m["file"], vdest, "video/mp4"), m["file"], flush=True)
            vtt = preparar_vtt(pasta / (Path(m["file"]).stem + ".srt"), f"{n - 1:02d}.vtt")
            subir(vtt, ldest, "text/vtt; charset=utf-8")
        itens.append((n, f"B{m['module']} · {m['title']}", vdest, ldest, round(m["seconds"])))

    if args.copiar_de:
        copiar_objeto(service, apostila_dest.replace(emp, origem_emp, 1), apostila_dest)
    else:
        print(" ", subir(pasta / "APOSTILA_LEITURA_NR10_BASICO_RASCUNHO.pdf", apostila_dest, "application/pdf"),
              "apostila", flush=True)

    linhas = [f"update treinamento_aula set deleted_at = now() where curso_id='{cid}' and deleted_at is null;",
              "insert into treinamento_aula (empresa_id, curso_id, ordem, titulo, tipo, fonte, arquivo_ref, "
              f"youtube_id, duracao_seg) values ('{emp}', '{cid}', 1, "
              f"{q('Apostila do curso — leitura obrigatória')}, 'pdf', 'upload', "
              f"{q('treinamentos/' + apostila_dest)}, null, {APOSTILA_BASICO_MIN * 60});"]
    for ordem, titulo, vref, lref, dur in itens:
        linhas.append("insert into treinamento_aula (empresa_id, curso_id, ordem, titulo, tipo, fonte, "
                      f"video_ref, legenda_ref, youtube_id, duracao_seg) values ('{emp}', '{cid}', {ordem}, "
                      f"{q(titulo)}, 'video', 'upload', {q('treinamentos/' + vref)}, "
                      f"{q('treinamentos/' + lref)}, null, {dur});")
    executar_sql(linhas, f"expandido_{args.empresa}")
    n = db(f"select count(*) n from treinamento_aula where curso_id='{cid}' and deleted_at is null")[0]["n"]
    print(f"NR-10 Básico ({args.empresa}): {n} aulas ativas (1 apostila + {len(itens)} módulos)")


def cmd_apostilas(args):
    emp = EMPRESAS[args.empresa]
    pasta = PASTA_ENTREGA / "00_ESTRUTURA_CONSOLIDADA_2026-09-24"
    service = chave_service() if args.copiar_de else None
    origem_emp = EMPRESAS[args.copiar_de] if args.copiar_de else None
    linhas = []
    for arquivo, codigo, slug, minutos in GUIAS:
        cid = curso_id(emp, codigo)
        destino = f"{emp}/ead/{slug}/guia_leitura.pdf"
        ja = db(f"select count(*) n from treinamento_aula where curso_id='{cid}' and deleted_at is null "
                f"and arquivo_ref={q('treinamentos/' + destino)}")[0]["n"]
        if ja:
            print(f"  {codigo}: guia já cadastrado, pulando")
            continue
        if args.copiar_de:
            print(" ", copiar_objeto(service, destino.replace(emp, origem_emp, 1), destino), codigo, flush=True)
        else:
            print(" ", subir(pasta / arquivo, destino, "application/pdf"), arquivo, flush=True)
        linhas.append("insert into treinamento_aula (empresa_id, curso_id, ordem, titulo, tipo, fonte, "
                      f"arquivo_ref, youtube_id, duracao_seg) values ('{emp}', '{cid}', 0, "
                      f"{q('Guia do curso — leitura obrigatória')}, 'pdf', 'upload', "
                      f"{q('treinamentos/' + destino)}, null, {minutos * 60});")
    if linhas:
        executar_sql(linhas, f"apostilas_{args.empresa}")
    print(f"guias adicionados ({args.empresa}): {len(linhas)}")


def cmd_reciclagem(args):
    emp = EMPRESAS[args.empresa]
    linhas = []
    criados = []
    for codigo in RECICLAGENS:
        novo_codigo = codigo + " RECICLAGEM"
        if db(f"select count(*) n from treinamento_curso where empresa_id='{emp}' "
              f"and codigo={q(novo_codigo)} and deleted_at is null")[0]["n"]:
            print(f"  {novo_codigo} já existe, pulando")
            continue
        cid = curso_id(emp, codigo)
        linhas.append(
            "insert into treinamento_curso (id, empresa_id, nome, codigo, descricao, validade_meses, "
            "carga_horaria_horas, nota_minima, max_tentativas, intervalo_tentativa_min, "
            "conteudo_programatico, projeto_pedagogico_ref, responsavel_tecnico_nome, "
            "responsavel_tecnico_registro, instrutor_nome, instrutor_qualificacao, tutor_telefone, ativo) "
            f"select gen_random_uuid(), empresa_id, nome || ' — Reciclagem Periódica (8h)', {q(novo_codigo)}, "
            f"{q('Reciclagem periódica (bienal) com o mesmo material do curso completo. ')} || coalesce(descricao, ''), "
            "24, 8, nota_minima, max_tentativas, intervalo_tentativa_min, conteudo_programatico, "
            "projeto_pedagogico_ref, responsavel_tecnico_nome, responsavel_tecnico_registro, instrutor_nome, "
            f"instrutor_qualificacao, tutor_telefone, false from treinamento_curso where id='{cid}';")
        linhas.append(
            "insert into treinamento_aula (empresa_id, curso_id, ordem, titulo, modulo, tipo, fonte, "
            "video_ref, legenda_ref, arquivo_ref, conteudo_texto, youtube_id, duracao_seg) "
            "select a.empresa_id, "
            f"(select id from treinamento_curso where empresa_id='{emp}' and codigo={q(novo_codigo)} and deleted_at is null), "
            "a.ordem, a.titulo, a.modulo, a.tipo, a.fonte, a.video_ref, a.legenda_ref, a.arquivo_ref, "
            f"a.conteudo_texto, a.youtube_id, a.duracao_seg from treinamento_aula a where a.curso_id='{cid}' "
            "and a.deleted_at is null;")
        linhas.append(
            "insert into treinamento_questao (empresa_id, curso_id, ordem, pergunta, opcoes, correta, comentario) "
            "select q.empresa_id, "
            f"(select id from treinamento_curso where empresa_id='{emp}' and codigo={q(novo_codigo)} and deleted_at is null), "
            f"q.ordem, q.pergunta, q.opcoes, q.correta, q.comentario from treinamento_questao q where q.curso_id='{cid}' "
            "and q.deleted_at is null;")
        criados.append(novo_codigo)
    if linhas:
        executar_sql(linhas, f"reciclagem_{args.empresa}")
    for r in db(f"select codigo, carga_horaria_horas, validade_meses, "
                f"(select count(*) from treinamento_aula a where a.curso_id=c.id and a.deleted_at is null) aulas, "
                f"(select count(*) from treinamento_questao qq where qq.curso_id=c.id and qq.deleted_at is null) questoes "
                f"from treinamento_curso c where empresa_id='{emp}' and codigo like '%RECICLAGEM' and deleted_at is null"):
        print(f"  {r['codigo']}: {r['aulas']} aulas, {r['questoes']} questões, {r['carga_horaria_horas']}h, "
              f"validade {r['validade_meses']}m")
    print(f"reciclagens criadas ({args.empresa}): {len(criados)}")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("comando", choices=["cargas", "expandido", "apostilas", "reciclagem"])
    p.add_argument("--empresa", choices=list(EMPRESAS), default="sinergia")
    p.add_argument("--copiar-de", dest="copiar_de", choices=list(EMPRESAS))
    args = p.parse_args()
    if args.copiar_de == args.empresa:
        sys.exit("--copiar-de deve ser a OUTRA empresa")
    inicio = time.time()
    {"cargas": cmd_cargas, "expandido": cmd_expandido,
     "apostilas": cmd_apostilas, "reciclagem": cmd_reciclagem}[args.comando](args)
    print(f"ok em {time.time() - inicio:.0f}s")


if __name__ == "__main__":
    main()
