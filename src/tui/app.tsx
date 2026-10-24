import { useEffect, useRef, useState } from "react";
import { Box, render, Static, Text, useApp, useInput } from "ink";
import { loadSeats } from "../agent/seat-loader";
import { createRegistry, type ProviderRegistry } from "../llm/factory";
import {
  executeCommand,
  type ChatTurn,
  type MessageKind,
  type TuiContext,
  type TuiMessage,
} from "./commands";

const KIND_STYLE: Record<MessageKind, { color: string; label: string }> = {
  user: { color: "cyan", label: "你" },
  coder: { color: "green", label: "Coder" },
  viewer: { color: "yellow", label: "Viewer" },
  tester: { color: "magenta", label: "Tester" },
  system: { color: "gray", label: "系統" },
  error: { color: "red", label: "錯誤" },
  task: { color: "blue", label: "管道" },
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function Spinner({ label }: { label: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => v + 1), 90);
    return () => clearInterval(t);
  }, []);
  return (
    <Text color="yellow">
      {SPINNER_FRAMES[i % SPINNER_FRAMES.length]} {label}思考中…
    </Text>
  );
}

function App(props: {
  mock: boolean;
  seats: ReturnType<typeof loadSeats>;
  registry?: ProviderRegistry;
  agentsDir: string;
  reportsDir: string;
}) {
  const { exit } = useApp();
  const [, setTick] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIdx = useRef(-1);

  const ctxRef = useRef<TuiContext | null>(null);
  if (ctxRef.current === null) {
    ctxRef.current = {
      mock: props.mock,
      seats: props.seats,
      registry: props.registry,
      agentsDir: props.agentsDir,
      reportsDir: props.reportsDir,
      messages: [] as TuiMessage[],
      chat: [] as ChatTurn[],
      emit: () => setTick((t) => t + 1),
      busy: (role) => setBusy(role),
      exit: () => exit(),
    };
    ctxRef.current.messages.push({
      kind: "system",
      text: props.mock
        ? "Khuimeng TUI（mock 模式）— 直接輸入訊息跟 Coder 對話；/help 看指令。"
        : "Khuimeng TUI — 直接輸入訊息跟 Coder 對話；/help 看指令。",
    });
  }
  const ctx = ctxRef.current;

  useInput((ch, key) => {
    if (key.return) {
      const line = input;
      setInput("");
      if (!line.trim() || busy) return;
      historyRef.current.push(line);
      historyIdx.current = -1;
      void executeCommand(ctx, line);
      return;
    }
    if (key.upArrow) {
      const h = historyRef.current;
      if (h.length === 0) return;
      historyIdx.current = historyIdx.current < 0 ? h.length - 1 : Math.max(0, historyIdx.current - 1);
      setInput(h[historyIdx.current] ?? "");
      return;
    }
    if (key.downArrow) {
      const h = historyRef.current;
      if (historyIdx.current < 0) return;
      historyIdx.current += 1;
      if (historyIdx.current >= h.length) {
        historyIdx.current = -1;
        setInput("");
      } else {
        setInput(h[historyIdx.current] ?? "");
      }
      return;
    }
    if (key.backspace || key.delete) {
      setInput((v) => v.slice(0, -1));
      return;
    }
    if (ch && !key.ctrl && !key.meta && !key.escape && ch !== "\t") {
      setInput((v) => v + ch);
    }
  });

  const seatsLine = (["coder", "viewer", "tester"] as const)
    .map((r) => `${r}:${props.seats.seats[r]?.model?.split("/").pop() ?? "?"}`)
    .join("  ");

  return (
    <Box flexDirection="column">
      <Static items={ctx.messages}>
        {(m: TuiMessage, i: number) => {
          const s = KIND_STYLE[m.kind];
          return (
            <Box key={i} flexDirection="column" marginBottom={m.meta ? 0 : 0}>
              <Box>
                <Text color={s.color} bold>
                  [{s.label}]{" "}
                </Text>
                <Text color={s.color}>{m.text}</Text>
              </Box>
              {m.meta ? (
                <Text dimColor>　└─ {m.meta}</Text>
              ) : null}
            </Box>
          );
        }}
      </Static>
      {busy ? <Spinner label={busy === "task" ? "管道" : busy} /> : null}
      <Box borderStyle="round" flexDirection="column" paddingX={1}>
        <Text dimColor>
          {props.mock ? "mock" : "real"} · {seatsLine} · ↑↓ 歷史 · /help 指令
        </Text>
        <Box>
          <Text bold color="cyan">
            {"❯ "}
          </Text>
          <Text>{input}</Text>
          <Text color={busy ? "gray" : "green"}>▏</Text>
        </Box>
      </Box>
    </Box>
  );
}

export function runTui(opts: {
  mock: boolean;
  root: string;
  reportsDir?: string;
}): void {
  if (!process.stdin.isTTY) {
    console.error("錯誤: tui 需要互動式終端機（Raw mode）——請直接在終端機執行，不要管線/重導向。");
    process.exit(2);
  }
  const seats = loadSeats(opts.root + "/configs/seats.yaml");
  const registry = opts.mock ? undefined : createRegistry();
  render(
    <App
      mock={opts.mock}
      seats={seats}
      registry={registry}
      agentsDir={opts.root + "/agents"}
      reportsDir={opts.reportsDir ?? opts.root + "/reports/pipeline"}
    />,
  );
}
