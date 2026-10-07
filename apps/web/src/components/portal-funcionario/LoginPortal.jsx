import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  HardHat,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
  Check,
  Circle,
  Building2,
  ChevronRight,
} from "lucide-react";
import { chamarPortal } from "./api";
import {
  avisoDeSenhaLonga,
  confirmacaoDivergiu,
  normalizarUsuario,
  podeTrocarSenha,
  regrasDaSenha,
  senhaNovaIgualAtual,
} from "@/lib/portal-senha";
import {
  TEXTOS_DO_LOGIN,
  passoDaAtivacao,
  passoDoLogin,
  pedidoDaAtivacao,
  podeEnviarAtivacao,
  reacaoAoErroDaAtivacao,
} from "@/lib/portal-login";

function Moldura({ titulo, subtitulo, children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-amber-500 rounded-xl flex items-center justify-center text-white">
              <HardHat className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-semibold text-slate-900 text-lg leading-tight">{titulo}</h1>
              <p className="text-sm text-slate-500">{subtitulo}</p>
            </div>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

function CampoSenha({ id, valor, onChange, autoComplete, rotulo }) {
  const [ver, setVer] = useState(false);
  return (
    <div>
      <Label htmlFor={id}>{rotulo}</Label>
      <div className="relative mt-1">
        <Input
          id={id}
          type={ver ? "text" : "password"}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="h-11 pr-10"
        />
        <button
          type="button"
          onClick={() => setVer(!ver)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 p-1"
          aria-label={ver ? "Esconder senha" : "Mostrar senha"}
        >
          {ver ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

/** As regras da senha, visíveis antes de enviar: cada uma vira "cumprida" conforme o aluno digita. */
function RegrasDaSenha({ regras }) {
  return (
    <ul className="space-y-1 text-xs" aria-label="Regras da senha">
      {regras.map((r) => (
        <li
          key={r.id}
          className={`flex items-start gap-1.5 ${r.ok ? "text-emerald-700" : "text-slate-500"}`}
        >
          {r.ok ? (
            <Check className="w-3.5 h-3.5 mt-px shrink-0" aria-label="Cumprida" />
          ) : (
            <Circle
              className="w-3.5 h-3.5 mt-px shrink-0"
              aria-label={r.aoSalvar ? "Conferida ao salvar" : "Pendente"}
            />
          )}
          <span>{r.texto}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A senha nova e a confirmação, com as regras (T27). `atual` (quando há) serve para avisar "diferente da atual".
 * Usado na criação da senha, na troca obrigatória da 2ª empresa e na troca voluntária.
 */
function CamposDaSenhaNova({ nova, setNova, confirma, setConfirma, usuario, atual }) {
  return (
    <>
      <div className="space-y-2">
        <CampoSenha
          id="senha-nova"
          rotulo="Nova senha"
          valor={nova}
          onChange={setNova}
          autoComplete="new-password"
        />
        {/* sem `maxLength`: o campo cortaria a senha colada em silêncio; o aviso e a regra de tamanho
            dizem o que houve (T27) */}
        {avisoDeSenhaLonga(nova) && (
          <p role="alert" className="text-xs text-red-600">
            {avisoDeSenhaLonga(nova)}
          </p>
        )}
        <RegrasDaSenha regras={regrasDaSenha(nova, usuario)} />
        {atual && senhaNovaIgualAtual(nova, atual) && (
          <p className="text-xs text-amber-700">Escolha uma senha diferente da atual</p>
        )}
      </div>
      <div className="space-y-1">
        <CampoSenha
          id="senha-confirma"
          rotulo="Repita a nova senha"
          valor={confirma}
          onChange={setConfirma}
          autoComplete="new-password"
        />
        {/* o aviso fica sob o campo que passou do limite: a confirmação colada com 80 caracteres
            não pode acusar o campo "Nova senha" (A5) */}
        {avisoDeSenhaLonga(confirma) && (
          <p role="alert" className="text-xs text-red-600">
            {avisoDeSenhaLonga(confirma)}
          </p>
        )}
        {confirmacaoDivergiu(nova, confirma) && (
          <p className="text-xs text-amber-700">As duas senhas não são iguais</p>
        )}
      </div>
    </>
  );
}

/**
 * Lista de empresas para escolher (no login com duas ou mais empresas liberadas e no "Trocar de empresa"): um botão
 * por empresa, com logo e nome. `id` é o cadastro do funcionário naquela empresa.
 */
export function ListaDeEmpresas({ empresas, onEscolher, ocupado }) {
  return (
    <div className="space-y-2" role="list" aria-label="Empresas">
      {empresas.map((e) => (
        <button
          key={e.id}
          type="button"
          role="listitem"
          onClick={() => onEscolher(e)}
          disabled={!!ocupado}
          className="w-full flex items-center gap-3 rounded-lg border bg-white p-3 text-left hover:bg-slate-50 disabled:opacity-60"
        >
          {e.logo_url ? (
            <img
              src={e.logo_url}
              alt=""
              className="w-10 h-10 rounded-md object-contain bg-white border"
            />
          ) : (
            <span className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center text-slate-500">
              <Building2 className="w-5 h-5" />
            </span>
          )}
          <span className="flex-1 font-medium text-slate-800">{e.nome || "Empresa"}</span>
          {ocupado === e.id ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </button>
      ))}
    </div>
  );
}

/** Depois da senha certa com duas ou mais empresas liberadas: "Em qual empresa você quer entrar?" (T38). */
export function EscolherEmpresaPortal({ tokenEscolha, empresas, onEntrar, onVoltar }) {
  const [ocupado, setOcupado] = useState(null);
  const [erro, setErro] = useState("");

  const escolher = async (empresa) => {
    setErro("");
    setOcupado(empresa.id);
    try {
      const r = await chamarPortal("escolher_empresa", {
        token_escolha: tokenEscolha,
        funcionario_id: empresa.id,
      });
      const passo = passoDoLogin(r);
      if (passo.tela === "painel") onEntrar(passo.sessao);
      else setErro(passo.mensagem || "Não foi possível entrar. Tente de novo.");
    } catch (e) {
      // o token da escolha vence em 5 min: volta ao login com o aviso
      if (e.codigo === "SESSAO") onVoltar(e.message);
      else setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Moldura titulo={TEXTOS_DO_LOGIN.escolherEmpresa} subtitulo="Portal do Funcionário">
      <ListaDeEmpresas empresas={empresas} onEscolher={escolher} ocupado={ocupado} />
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <Button type="button" variant="ghost" className="w-full" onClick={() => onVoltar("")}>
        Voltar
      </Button>
    </Moldura>
  );
}

/**
 * Entrou com a senha provisória (T38): a MESMA tela para todos ("Crie sua senha pessoal", com o link "Já uso o portal
 * em outra empresa"), porque a tela não pode dizer se o CPF já tem senha (defesa 2). Três modos:
 *  - `criar`: a senha nova (a primeira, ou a de quem esqueceu, pela provisória de uma empresa em que já entrava);
 *  - `ja_uso`: a senha que a pessoa já usa em outra empresa;
 *  - `troca`: a senha atual nasceu da provisória de outra empresa, então a pessoa escolhe uma nova (P10).
 */
export function AtivarAcessoPortal({ tokenAtivacao, empresaNome, usuario, onEntrar, onVoltar }) {
  const [modo, setModo] = useState("criar");
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [destacarJaUso, setDestacarJaUso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const pode = podeEnviarAtivacao({ modo, atual, nova, confirma, usuario });

  const mudarModo = (m) => {
    setModo(m);
    setErro("");
    setDestacarJaUso(false);
    setNova("");
    setConfirma("");
    if (m === "criar") setAtual("");
  };

  const enviar = async (e) => {
    e.preventDefault();
    setErro("");
    if (!pode) {
      setErro(
        modo === "ja_uso"
          ? "Digite a senha que você já usa"
          : "Confira os campos: a nova senha precisa cumprir as regras e as duas têm de ser iguais"
      );
      return;
    }
    setSalvando(true);
    try {
      const r = await chamarPortal("ativar", {
        token_ativacao: tokenAtivacao,
        ...pedidoDaAtivacao({ modo, atual, nova }),
      });
      const passo = passoDaAtivacao(r);
      if (passo.tela === "troca_obrigatoria") {
        // a senha atual continua digitada (em memória); falta escolher a nova
        setModo("troca");
        setNova("");
        setConfirma("");
      } else if (passo.tela === "painel") {
        onEntrar(passo.sessao);
      } else {
        setErro(passo.mensagem);
      }
    } catch (err) {
      const reacao = reacaoAoErroDaAtivacao(err);
      if (reacao.voltarAoLogin) {
        onVoltar(reacao.mensagem);
        return;
      }
      setErro(reacao.mensagem);
      setDestacarJaUso(reacao.destacarJaUso);
    } finally {
      setSalvando(false);
    }
  };

  const titulo =
    modo === "ja_uso"
      ? TEXTOS_DO_LOGIN.digiteASenhaQueUsa
      : modo === "troca"
        ? "Escolha uma senha nova"
        : TEXTOS_DO_LOGIN.crieSuaSenha;

  return (
    <Moldura titulo={titulo} subtitulo={empresaNome || "Portal do Funcionário"}>
      {modo === "criar" && (
        <Button
          type="button"
          variant={destacarJaUso ? "outline" : "link"}
          className={`h-auto p-0 ${destacarJaUso ? "w-full py-2 border-amber-400 text-amber-800" : "text-slate-700 underline"}`}
          onClick={() => mudarModo("ja_uso")}
        >
          {TEXTOS_DO_LOGIN.jaUsoOutraEmpresa}
        </Button>
      )}
      {modo === "criar" && (
        <p className="text-sm text-slate-600">
          A senha que você recebeu é provisória. Crie agora uma senha que só você saiba — ela vale
          como a sua assinatura nos treinamentos e nas entregas de EPI e ferramentas.
        </p>
      )}
      {modo === "troca" && (
        <p className="text-sm text-slate-600">{TEXTOS_DO_LOGIN.trocaObrigatoria}</p>
      )}
      <form onSubmit={enviar} className="space-y-4">
        {modo === "ja_uso" && (
          <CampoSenha
            id="senha-atual"
            rotulo="Senha que você já usa"
            valor={atual}
            onChange={setAtual}
            autoComplete="current-password"
          />
        )}
        {modo !== "ja_uso" && (
          <CamposDaSenhaNova
            nova={nova}
            setNova={setNova}
            confirma={confirma}
            setConfirma={setConfirma}
            usuario={usuario}
            atual={modo === "troca" ? atual : ""}
          />
        )}
        {erro && (
          <p role="alert" className="text-sm text-red-600">
            {erro}
          </p>
        )}
        <Button type="submit" className="w-full h-11 bg-slate-900" disabled={salvando || !pode}>
          {salvando ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <KeyRound className="w-4 h-4 mr-2" />
          )}
          {modo === "ja_uso" ? "Entrar" : modo === "troca" ? "Salvar e entrar" : "Salvar senha"}
        </Button>
        {modo === "ja_uso" && (
          <Button
            type="button"
            variant="link"
            className="w-full"
            onClick={() => mudarModo("criar")}
          >
            {TEXTOS_DO_LOGIN.voltarParaCriar}
          </Button>
        )}
        <Button type="button" variant="ghost" className="w-full" onClick={() => onVoltar("")}>
          Sair
        </Button>
      </form>
      {modo === "criar" && (
        <p className="text-xs text-slate-500">{TEXTOS_DO_LOGIN.avisoSenhaNova}</p>
      )}
    </Moldura>
  );
}

export function LoginPortal({ aviso, onEntrar }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);
  // T38: depois da senha, a escolha da empresa ou a ativação pela provisória
  const [etapa, setEtapa] = useState(null);
  const [avisoDaEtapa, setAvisoDaEtapa] = useState("");

  // `usuario` (já normalizado) só segue em memória, para as regras da senha conferirem "senha igual ao CPF"; a
  // página NÃO o guarda no aparelho junto com a sessão
  const entrarCom = (sessao) => onEntrar({ ...sessao, usuario: normalizarUsuario(usuario) });

  const entrar = async (e) => {
    e.preventDefault();
    setErro("");
    setAvisoDaEtapa("");
    setEntrando(true);
    try {
      const r = await chamarPortal("login", { usuario, senha });
      const passo = passoDoLogin(r);
      if (passo.tela === "painel") entrarCom(passo.sessao);
      else if (passo.tela === "erro") setErro(passo.mensagem);
      else {
        setSenha("");
        setEtapa(passo);
      }
    } catch (err) {
      setErro(err.message);
    } finally {
      setEntrando(false);
    }
  };

  const voltar = (mensagem) => {
    setEtapa(null);
    setSenha("");
    setAvisoDaEtapa(mensagem || "");
  };

  if (etapa?.tela === "escolher") {
    return (
      <EscolherEmpresaPortal
        tokenEscolha={etapa.tokenEscolha}
        empresas={etapa.empresas}
        onEntrar={entrarCom}
        onVoltar={voltar}
      />
    );
  }
  if (etapa?.tela === "ativar") {
    return (
      <AtivarAcessoPortal
        tokenAtivacao={etapa.tokenAtivacao}
        empresaNome={etapa.empresaNome}
        usuario={normalizarUsuario(usuario)}
        onEntrar={entrarCom}
        onVoltar={voltar}
      />
    );
  }

  const avisoNaTela = avisoDaEtapa || aviso;
  return (
    <Moldura titulo="Portal do Funcionário" subtitulo="Treinamentos e entregas">
      {avisoNaTela && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-md p-2">{avisoNaTela}</p>
      )}
      <form onSubmit={entrar} className="space-y-4">
        <div>
          <Label htmlFor="usuario">CPF ou usuário</Label>
          {/* teclado de TEXTO: o RH pode criar usuário com letras para quem não tem CPF */}
          <Input
            id="usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            inputMode="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="CPF ou usuário"
            aria-describedby="usuario-dica"
            className="h-11 mt-1"
          />
          <p id="usuario-dica" className="text-xs text-slate-500 mt-1">
            Digite o seu CPF (com ou sem pontos) ou o usuário que o RH informou.
          </p>
        </div>
        <CampoSenha
          id="senha"
          rotulo="Senha"
          valor={senha}
          onChange={setSenha}
          autoComplete="current-password"
        />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <Button
          type="submit"
          className="w-full h-11 bg-slate-900"
          disabled={entrando || !usuario.trim() || !senha}
        >
          {entrando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Entrar
        </Button>
      </form>
      <p className="text-xs text-slate-500">
        Não tem acesso ou esqueceu a senha? Fale com o RH da empresa.
      </p>
    </Moldura>
  );
}

/**
 * Troca de senha VOLUNTÁRIA, com a senha atual (o primeiro acesso virou a etapa da provisória, T38). A senha é da
 * pessoa: a nova vale em todas as empresas e as sessões abertas nas outras caem.
 */
export function TrocarSenhaPortal({ token, nome, usuario = "", onConcluir, onCancelar }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  // `usuario` vem do login (só em memória). Sem ele (tela recarregada), a regra "diferente do CPF" fica
  // por conta do servidor, que confere de novo em toda troca.
  const pode = podeTrocarSenha({ atual, nova, confirma, obrigatoria: false, usuario });

  const salvar = async (e) => {
    e.preventDefault();
    setErro("");
    if (!pode) {
      setErro(
        "Confira os campos: a nova senha precisa cumprir as regras e as duas têm de ser iguais"
      );
      return;
    }
    setSalvando(true);
    try {
      const r = await chamarPortal("trocar_senha", { nova_senha: nova, senha_atual: atual }, token);
      onConcluir(r.token);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Moldura
      titulo="Alterar senha"
      subtitulo={nome ? `Olá, ${nome.split(" ")[0]}` : "Portal do Funcionário"}
    >
      <p className="text-sm text-slate-600">{TEXTOS_DO_LOGIN.avisoTrocaDeSenha}</p>
      <form onSubmit={salvar} className="space-y-4">
        <CampoSenha
          id="senha-atual"
          rotulo="Senha atual"
          valor={atual}
          onChange={setAtual}
          autoComplete="current-password"
        />
        <CamposDaSenhaNova
          nova={nova}
          setNova={setNova}
          confirma={confirma}
          setConfirma={setConfirma}
          usuario={usuario}
          atual={atual}
        />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <Button type="submit" className="w-full h-11 bg-slate-900" disabled={salvando || !pode}>
          {salvando ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <KeyRound className="w-4 h-4 mr-2" />
          )}
          Salvar senha
        </Button>
        {onCancelar && (
          <Button type="button" variant="ghost" className="w-full" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
      </form>
    </Moldura>
  );
}
