import React, { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { resolveStorageUrl } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import CursoPortal from "@/components/portal-funcionario/CursoPortal";
import { criarApiPrevia, montarItemPrevia, refsDaPrevia } from "@/lib/portal-previa";

/** Validade das URLs assinadas da prévia: a mesma do portal do aluno (3 h). */
const VALIDADE_URL_SEG = 3 * 60 * 60;

const semOperacao = () => {};

/**
 * "Ver como aluno" (T28): o responsável técnico revisa vídeos, apostilas, questões e gabarito como o
 * aluno vê, sem matricular ninguém. Abre o `CursoPortal` do portal numa gaveta, com os dados montados
 * aqui, na tela do RH (URLs assinadas por `resolveStorageUrl`), e uma API injetada que NUNCA chama o
 * `portalFuncionario` (lib/portal-previa.js): nenhuma trilha, tentativa, progresso, dúvida ou certificado.
 *
 * Monte só enquanto a prévia estiver aberta: cada abertura refaz os dados a partir do que a tela do
 * curso mostra agora (o que `curso`, `aulas` e `questoes` tinham ao abrir).
 */
export default function PreviaAlunoCurso({ curso, aulas, questoes, onFechar }) {
  // fotografia do que o editor mostrava ao abrir: o editor recarrega por baixo e não deve mexer na prévia
  const origemRef = useRef({ curso, aulas, questoes });
  const carregadoEmRef = useRef(0);
  const [item, setItem] = useState(null);
  const [falhou, setFalhou] = useState(false);
  // a API da prévia é criada uma vez, com as questões e a nota mínima do item inicial
  const apiRef = useRef(null);

  const montar = async () => {
    const origem = origemRef.current;
    const refs = refsDaPrevia(origem);
    const pares = await Promise.all(
      refs.map(async (ref) => [ref, await resolveStorageUrl(ref, VALIDADE_URL_SEG)])
    );
    carregadoEmRef.current = Date.now();
    return montarItemPrevia({ ...origem, urls: new Map(pares) });
  };

  useEffect(() => {
    let vivo = true;
    montar()
      .then((montado) => {
        if (!vivo) return;
        apiRef.current = criarApiPrevia({ item: montado });
        setItem(montado);
      })
      .catch((e) => {
        console.error("[prévia do curso] falha ao montar:", e);
        if (vivo) setFalhou(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // o CursoPortal pede os dados de novo quando uma URL vence (vídeo que não carrega, aula aberta
  // depois de 2h30); aqui "recarregar" assina as URLs outra vez e devolve o mesmo formato do portal
  const recarregar = async () => {
    try {
      const novo = await montar();
      setItem(novo);
      return { cursos: [novo] };
    } catch (e) {
      console.error("[prévia do curso] falha ao renovar:", e);
      return null;
    }
  };

  return (
    <Sheet open onOpenChange={(aberto) => !aberto && onFechar()}>
      <SheetContent
        // a gaveta é a tela do aluno inteira; o "x" da gaveta cobriria o cabeçalho do curso
        // (o "Sair da prévia" e a seta do cabeçalho fecham do mesmo jeito)
        className="left-0 w-full max-w-none gap-0 overflow-y-auto p-0 sm:max-w-none lg:left-0 lg:w-full [&>button]:hidden"
      >
        <SheetTitle className="sr-only">Prévia do curso como aluno</SheetTitle>
        <SheetDescription className="sr-only">
          O curso como o aluno vê. Nada é gravado.
        </SheetDescription>
        {item ? (
          <CursoPortal
            item={item}
            api={apiRef.current}
            recarregar={recarregar}
            dadosCarregadosEm={() => carregadoEmRef.current}
            onVoltar={onFechar}
            onErroSessao={semOperacao}
          />
        ) : falhou ? (
          <div className="p-6 space-y-3" role="alert">
            <p className="flex items-center gap-2 font-semibold text-amber-800">
              <AlertTriangle className="w-4 h-4" /> Não foi possível montar a prévia.
            </p>
            <p className="text-sm text-slate-600">Feche e tente de novo.</p>
            <Button type="button" variant="outline" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        ) : (
          <div
            role="status"
            className="min-h-screen flex items-center justify-center gap-2 text-slate-500"
          >
            <Loader2 className="w-5 h-5 animate-spin" /> Preparando a prévia...
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
