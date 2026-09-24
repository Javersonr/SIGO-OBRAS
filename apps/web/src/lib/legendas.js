/**
 * Converte legenda .srt para WebVTT (.vtt), o único formato que o <track> do
 * navegador aceita. Um .vtt passa direto.
 */
export function srtParaVtt(texto) {
  const corpo = (texto || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (corpo.startsWith("WEBVTT")) return corpo + "\n";
  return "WEBVTT\n\n" + corpo.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2") + "\n";
}
