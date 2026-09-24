import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HardHat, Loader2, Eye, EyeOff, KeyRound } from "lucide-react";
import { chamarPortal } from "./api";

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

export function LoginPortal({ aviso, onEntrar }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setErro("");
    setEntrando(true);
    try {
      const r = await chamarPortal("login", { usuario, senha });
      onEntrar({ token: r.token, nome: r.nome, trocar_senha: r.trocar_senha });
    } catch (err) {
      setErro(err.message);
    } finally {
      setEntrando(false);
    }
  };

  return (
    <Moldura titulo="Portal do Funcionário" subtitulo="Treinamentos e entregas">
      {aviso && <p className="text-sm text-amber-700 bg-amber-50 rounded-md p-2">{aviso}</p>}
      <form onSubmit={entrar} className="space-y-4">
        <div>
          <Label htmlFor="usuario">Usuário (seu CPF)</Label>
          <Input
            id="usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            inputMode="numeric"
            autoComplete="username"
            placeholder="000.000.000-00"
            className="h-11 mt-1"
          />
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

/** Troca de senha: obrigatória no 1º acesso (senha provisória) ou voluntária. */
export function TrocarSenhaPortal({ token, obrigatoria, nome, onConcluir, onCancelar }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async (e) => {
    e.preventDefault();
    setErro("");
    if (nova !== confirma) {
      setErro("As duas senhas não são iguais");
      return;
    }
    setSalvando(true);
    try {
      const r = await chamarPortal(
        "trocar_senha",
        { nova_senha: nova, senha_atual: obrigatoria ? undefined : atual },
        token
      );
      onConcluir(r.token);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Moldura
      titulo={obrigatoria ? "Crie sua senha pessoal" : "Alterar senha"}
      subtitulo={nome ? `Olá, ${nome.split(" ")[0]}` : "Portal do Funcionário"}
    >
      {obrigatoria && (
        <p className="text-sm text-slate-600">
          A senha que você recebeu é provisória. Crie agora uma senha que só você saiba — ela vale
          como a sua assinatura nos treinamentos e nas entregas de EPI e ferramentas.
        </p>
      )}
      <form onSubmit={salvar} className="space-y-4">
        {!obrigatoria && (
          <CampoSenha
            id="senha-atual"
            rotulo="Senha atual"
            valor={atual}
            onChange={setAtual}
            autoComplete="current-password"
          />
        )}
        <CampoSenha
          id="senha-nova"
          rotulo="Nova senha (mínimo 6 caracteres)"
          valor={nova}
          onChange={setNova}
          autoComplete="new-password"
        />
        <CampoSenha
          id="senha-confirma"
          rotulo="Repita a nova senha"
          valor={confirma}
          onChange={setConfirma}
          autoComplete="new-password"
        />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <Button
          type="submit"
          className="w-full h-11 bg-slate-900"
          disabled={salvando || nova.length < 6 || !confirma}
        >
          {salvando ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <KeyRound className="w-4 h-4 mr-2" />
          )}
          Salvar senha
        </Button>
        {onCancelar && (
          <Button type="button" variant="ghost" className="w-full" onClick={onCancelar}>
            {obrigatoria ? "Sair" : "Cancelar"}
          </Button>
        )}
      </form>
    </Moldura>
  );
}
