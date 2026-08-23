import type { BaseAgent } from "../agent/base-agent";

export interface SpeechEvent {
  agent: BaseAgent;
  content: string;
  round: number;
}

/**
 * 終端機會議室 UI。
 * MVP 階段以純文字輸出；未來可替換為 Ink 打字機效果。
 */
export class TerminalRoom {
  private round: number | undefined;

  renderIntro(topic: string): void {
    console.log("\n🔵 ===== Khuimeng 多角色辯論會議 =====");
    console.log(`  議題: ${topic}\n`);
  }

  renderSpeech(evt: SpeechEvent): void {
    const round = evt.round === 0 ? "開幕" : `第 ${evt.round} 輪`;
    console.log(
      `\n[${round}] ${evt.agent.name} (${evt.agent.providerName}/${evt.agent.model})`,
    );
    console.log("   " + evt.content.split("\n").join("\n   "));
  }

  renderSummary(summary: string): void {
    console.log("\n📋 ===== 最終摘要 =====");
    console.log(summary);
    console.log("🔚 辯論結束\n");
  }
}