export default Deno.serve(async (req) => {
  try {
    const csvContent = `ID,Nome,Cliente (Razão),Status,Origem,Cidade,Estado,CEP,Endereço,Valor contrato,Modalidade (opcional),Data licitação (opcional),Horário licitação (opcional)
,Projeto Exemplo 1,CLIENTE EXEMPLO LTDA,Iniciado,Prospecto,São Paulo,SP,01310-100,Avenida Paulista,50000.00,Pregão,01/01/2025,10:00
,Projeto Exemplo 2,OUTRO CLIENTE SA,Planejamento,Referência,Rio de Janeiro,RJ,20000-000,Avenida Rio Branco,75000.00,Concorrência,15/01/2025,14:30
,Projeto Exemplo 3,TERCEIRO CLIENTE EIRELI,Execução,Rede,Belo Horizonte,MG,30130-100,Avenida Getúlio Vargas,120000.00,Tomada de Preços,20/01/2025,09:00`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': 'attachment; filename=modelo_importacao_projetos.csv'
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});