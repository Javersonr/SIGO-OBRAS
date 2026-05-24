import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const SMTP_HOST = Deno.env.get('SMTP_HOST');
const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '587');
const SMTP_USER = Deno.env.get('SMTP_USER');
const SMTP_PASS = Deno.env.get('SMTP_PASS');

async function enviarEmail(to, subject, html) {
  try {
    const resp = await fetch(`https://api.resend.com/emails`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'SIGO OBRAS <noreply@sigoobras.com.br>',
        to: [to],
        subject,
        html
      })
    });
    return resp.ok;
  } catch (e) {
    console.error('Erro ao enviar email:', e.message);
    return false;
  }
}

function getPrefs(usuario_email, prefsCache) {
  const prefs = prefsCache[usuario_email];
  if (!prefs) return { app: true, email: false };
  return prefs;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Permite chamada sem autenticação para automações
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === 'admin';
    } catch {}

    const body = await req.json();
    const { empresa_id, tipo } = body;
    // tipos: estoque_baixo | projetos_atrasados | contas_vencer | oportunidades_quentes | todos

    if (!empresa_id) {
      return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });
    }

    // Buscar todos os usuários ativos da empresa
    const vinculos = await base44.asServiceRole.entities.UsuarioEmpresa.filter({ empresa_id, ativo: true });

    // Buscar preferências de notificação
    const todasPrefs = await base44.asServiceRole.entities.PreferenciaNotificacao.filter({ empresa_id });
    const prefsMap = {};
    for (const p of todasPrefs) {
      try {
        prefsMap[p.usuario_email] = JSON.parse(p.preferencias || '{}');
      } catch {
        prefsMap[p.usuario_email] = {};
      }
    }

    const resultados = { alertas: [], emails_enviados: 0, notificacoes_criadas: 0 };

    const hoje = new Date();
    const em7dias = new Date(hoje);
    em7dias.setDate(em7dias.getDate() + 7);
    const em3dias = new Date(hoje);
    em3dias.setDate(em3dias.getDate() + 3);

    const tiposParaProcessar = tipo === 'todos' || !tipo
      ? ['estoque_baixo', 'projetos_atrasados', 'contas_vencer', 'oportunidades_quentes']
      : [tipo];

    // ==========================================
    // ESTOQUE BAIXO
    // ==========================================
    if (tiposParaProcessar.includes('estoque_baixo')) {
      const materiais = await base44.asServiceRole.entities.Material.filter({ empresa_id, ativo: true });
      const baixo = materiais.filter(m => m.estoque_minimo > 0 && m.estoque <= m.estoque_minimo);

      if (baixo.length > 0) {
        const usuariosAlvo = vinculos.filter(v => {
          const perfil = v.perfil;
          return perfil === 'Admin' || perfil === 'Estoque' || perfil === 'Compras' || v.is_owner;
        });

        for (const v of usuariosAlvo) {
          const pref = (prefsMap[v.usuario_email]?.estoque_baixo) ?? { app: true, email: false };

          if (pref.app !== false) {
            const criticos = baixo.filter(m => m.estoque <= m.estoque_minimo * 0.5);
            const normais = baixo.filter(m => m.estoque > m.estoque_minimo * 0.5);

            if (criticos.length > 0) {
              await base44.asServiceRole.entities.Notificacao.create({
                empresa_id,
                usuario_email: v.usuario_email,
                tipo: 'Estoque',
                titulo: `⚠️ ${criticos.length} material(is) com estoque crítico`,
                mensagem: criticos.slice(0, 3).map(m => `${m.nome}: ${m.estoque} ${m.unidade}`).join(', ') + (criticos.length > 3 ? ` e mais ${criticos.length - 3}...` : ''),
                link: '/Estoque',
                prioridade: 'Urgente',
                lida: false
              });
              resultados.notificacoes_criadas++;
            }
            if (normais.length > 0) {
              await base44.asServiceRole.entities.Notificacao.create({
                empresa_id,
                usuario_email: v.usuario_email,
                tipo: 'Estoque',
                titulo: `📦 ${normais.length} material(is) com estoque baixo`,
                mensagem: normais.slice(0, 3).map(m => `${m.nome}: ${m.estoque} ${m.unidade}`).join(', ') + (normais.length > 3 ? ` e mais ${normais.length - 3}...` : ''),
                link: '/Estoque',
                prioridade: 'Alta',
                lida: false
              });
              resultados.notificacoes_criadas++;
            }
          }

          if (pref.email === true) {
            const html = `<h2>Alerta de Estoque Baixo</h2>
              <p>Olá ${v.nome_completo || v.usuario_email},</p>
              <p>Os seguintes materiais estão com estoque abaixo do mínimo:</p>
              <ul>${baixo.map(m => `<li><b>${m.nome}</b>: ${m.estoque} ${m.unidade} (mínimo: ${m.estoque_minimo})</li>`).join('')}</ul>
              <p>Acesse o sistema para realizar pedidos de compra.</p>`;
            const ok = await enviarEmail(v.usuario_email, '⚠️ Alerta: Estoque Baixo - SIGO OBRAS', html);
            if (ok) resultados.emails_enviados++;
          }
        }
        resultados.alertas.push({ tipo: 'estoque_baixo', itens: baixo.length });
      }
    }

    // ==========================================
    // PROJETOS ATRASADOS
    // ==========================================
    if (tiposParaProcessar.includes('projetos_atrasados')) {
      const projetos = await base44.asServiceRole.entities.Projeto.filter({ empresa_id });
      const atrasados = projetos.filter(p => {
        if (!p.data_fechamento_prevista) return false;
        const status = (p.status_nome || '').toLowerCase();
        const concluido = status.includes('conclu') || status.includes('encerr') || status.includes('cancel');
        if (concluido) return false;
        return new Date(p.data_fechamento_prevista) < hoje;
      });

      if (atrasados.length > 0) {
        const admins = vinculos.filter(v => v.perfil === 'Admin' || v.is_owner);
        for (const v of admins) {
          const pref = (prefsMap[v.usuario_email]?.projetos_atrasados) ?? { app: true, email: false };

          if (pref.app !== false) {
            await base44.asServiceRole.entities.Notificacao.create({
              empresa_id,
              usuario_email: v.usuario_email,
              tipo: 'Projeto',
              titulo: `🚨 ${atrasados.length} projeto(s) atrasado(s)`,
              mensagem: atrasados.slice(0, 3).map(p => p.nome).join(', ') + (atrasados.length > 3 ? ` e mais ${atrasados.length - 3}...` : ''),
              link: '/Projetos',
              prioridade: 'Alta',
              lida: false
            });
            resultados.notificacoes_criadas++;
          }

          if (pref.email === true) {
            const html = `<h2>Projetos Atrasados</h2>
              <p>Os seguintes projetos ultrapassaram a data prevista de conclusão:</p>
              <ul>${atrasados.map(p => `<li><b>${p.nome}</b> - Previsão: ${new Date(p.data_fechamento_prevista).toLocaleDateString('pt-BR')}</li>`).join('')}</ul>`;
            const ok = await enviarEmail(v.usuario_email, '🚨 Atenção: Projetos Atrasados - SIGO OBRAS', html);
            if (ok) resultados.emails_enviados++;
          }
        }
        resultados.alertas.push({ tipo: 'projetos_atrasados', itens: atrasados.length });
      }
    }

    // ==========================================
    // CONTAS A VENCER
    // ==========================================
    if (tiposParaProcessar.includes('contas_vencer')) {
      const transacoes = await base44.asServiceRole.entities.TransacaoFinanceira.filter({ empresa_id });
      const aVencer = transacoes.filter(t => {
        if (t.pago || t.tipo !== 'Despesa') return false;
        if (!t.data_vencimento) return false;
        const venc = new Date(t.data_vencimento);
        return venc >= hoje && venc <= em7dias;
      });

      const vencidas = transacoes.filter(t => {
        if (t.pago || t.tipo !== 'Despesa') return false;
        if (!t.data_vencimento) return false;
        return new Date(t.data_vencimento) < hoje;
      });

      const financeiros = vinculos.filter(v => v.perfil === 'Admin' || v.perfil === 'Financeiro' || v.is_owner);

      for (const v of financeiros) {
        const pref = (prefsMap[v.usuario_email]?.contas_vencer) ?? { app: true, email: false };

        if (pref.app !== false) {
          if (vencidas.length > 0) {
            await base44.asServiceRole.entities.Notificacao.create({
              empresa_id,
              usuario_email: v.usuario_email,
              tipo: 'Financeiro',
              titulo: `💸 ${vencidas.length} conta(s) vencida(s) sem pagamento`,
              mensagem: `Total: R$ ${vencidas.reduce((s, t) => s + (t.valor || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
              link: '/Financeiro',
              prioridade: 'Urgente',
              lida: false
            });
            resultados.notificacoes_criadas++;
          }
          if (aVencer.length > 0) {
            await base44.asServiceRole.entities.Notificacao.create({
              empresa_id,
              usuario_email: v.usuario_email,
              tipo: 'Financeiro',
              titulo: `📅 ${aVencer.length} conta(s) vencendo nos próximos 7 dias`,
              mensagem: `Total: R$ ${aVencer.reduce((s, t) => s + (t.valor || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
              link: '/Financeiro',
              prioridade: 'Alta',
              lida: false
            });
            resultados.notificacoes_criadas++;
          }
        }

        if (pref.email === true && (vencidas.length > 0 || aVencer.length > 0)) {
          const html = `<h2>Alertas Financeiros</h2>
            ${vencidas.length > 0 ? `<h3>Contas Vencidas (${vencidas.length})</h3><ul>${vencidas.slice(0, 5).map(t => `<li>${t.descricao}: R$ ${t.valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>`).join('')}</ul>` : ''}
            ${aVencer.length > 0 ? `<h3>Vencendo em 7 dias (${aVencer.length})</h3><ul>${aVencer.slice(0, 5).map(t => `<li>${t.descricao}: R$ ${t.valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${new Date(t.data_vencimento).toLocaleDateString('pt-BR')}</li>`).join('')}</ul>` : ''}`;
          const ok = await enviarEmail(v.usuario_email, '📅 Alertas Financeiros - SIGO OBRAS', html);
          if (ok) resultados.emails_enviados++;
        }
      }
      resultados.alertas.push({ tipo: 'contas_vencer', aVencer: aVencer.length, vencidas: vencidas.length });
    }

    // ==========================================
    // PRAZO PROPOSTA LICITAÇÃO (2 dias antes)
    // ==========================================
    if (tiposParaProcessar.includes('todos') || tipo === 'todos' || !tipo) {
      const em2dias = new Date(hoje);
      em2dias.setDate(em2dias.getDate() + 2);
      const amanha = new Date(hoje);
      amanha.setDate(amanha.getDate() + 1);

      const todasOportunidades = await base44.asServiceRole.entities.Oportunidade.filter({ empresa_id, arquivado: false });
      const propostasVencendo = todasOportunidades.filter(o => {
        if (!o.licitacao_data_proposta) return false;
        const dataProposta = new Date(o.licitacao_data_proposta + 'T00:00:00');
        // Avisar no dia D-2 e D-1
        return dataProposta >= hoje && dataProposta <= em2dias;
      });

      if (propostasVencendo.length > 0) {
        const gestores = vinculos.filter(v => v.perfil === 'Admin' || v.perfil === 'Gestor' || v.is_owner);
        for (const v of gestores) {
          await base44.asServiceRole.entities.Notificacao.create({
            empresa_id,
            usuario_email: v.usuario_email,
            tipo: 'Cotação',
            titulo: `📋 ${propostasVencendo.length} proposta(s) com prazo em até 2 dias!`,
            mensagem: propostasVencendo.slice(0, 3).map(o => {
              const data = new Date(o.licitacao_data_proposta + 'T00:00:00').toLocaleDateString('pt-BR');
              const horario = o.licitacao_horario_proposta ? ` às ${o.licitacao_horario_proposta}` : '';
              return `${o.nome} — limite: ${data}${horario}`;
            }).join(' | ') + (propostasVencendo.length > 3 ? ` e mais ${propostasVencendo.length - 3}...` : ''),
            link: '/Oportunidades',
            prioridade: 'Urgente',
            lida: false
          });
          resultados.notificacoes_criadas++;
        }
        resultados.alertas.push({ tipo: 'prazo_proposta', itens: propostasVencendo.length });
      }
    }

    // ==========================================
    // OPORTUNIDADES QUENTES
    // ==========================================
    if (tiposParaProcessar.includes('oportunidades_quentes')) {
      const oportunidades = await base44.asServiceRole.entities.Oportunidade.filter({ empresa_id });
      const quentes = oportunidades.filter(o => {
        const prob = o.probabilidade || 0;
        const valor = o.valor_estimado || 0;
        const fechamento = o.data_fechamento_prevista ? new Date(o.data_fechamento_prevista) : null;
        const fechandoEm3Dias = fechamento && fechamento >= hoje && fechamento <= em3dias;
        return (prob >= 75 && valor > 0) || fechandoEm3Dias;
      });

      if (quentes.length > 0) {
        const gestores = vinculos.filter(v => v.perfil === 'Admin' || v.perfil === 'Gestor' || v.is_owner);
        for (const v of gestores) {
          const pref = (prefsMap[v.usuario_email]?.oportunidades_quentes) ?? { app: true, email: false };

          if (pref.app !== false) {
            await base44.asServiceRole.entities.Notificacao.create({
              empresa_id,
              usuario_email: v.usuario_email,
              tipo: 'Cotação',
              titulo: `🔥 ${quentes.length} oportunidade(s) precisam de atenção`,
              mensagem: quentes.slice(0, 3).map(o => `${o.nome} (${o.probabilidade}% - R$ ${(o.valor_estimado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })})`).join(', '),
              link: '/Oportunidades',
              prioridade: 'Alta',
              lida: false
            });
            resultados.notificacoes_criadas++;
          }

          if (pref.email === true) {
            const html = `<h2>🔥 Oportunidades Quentes</h2>
              <p>As seguintes oportunidades precisam de atenção imediata:</p>
              <ul>${quentes.map(o => `<li><b>${o.nome}</b> - Probabilidade: ${o.probabilidade}% | Valor: R$ ${(o.valor_estimado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${o.data_fechamento_prevista ? ` | Fechamento: ${new Date(o.data_fechamento_prevista).toLocaleDateString('pt-BR')}` : ''}</li>`).join('')}</ul>`;
            const ok = await enviarEmail(v.usuario_email, '🔥 Oportunidades Quentes - SIGO OBRAS', html);
            if (ok) resultados.emails_enviados++;
          }
        }
        resultados.alertas.push({ tipo: 'oportunidades_quentes', itens: quentes.length });
      }
    }

    return Response.json({ success: true, ...resultados });
  } catch (error) {
    console.error('Erro ao disparar alertas:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});