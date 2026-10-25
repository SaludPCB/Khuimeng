import { useEffect, useRef, useState } from "react";
import { Box, render, Static, Text, useApp, useInput } from "ink";import { loadSeats } from "../agent/seat-loader";
import { createRegistry, type ProviderRegistry } from "../llm/factory";
import {
  executeCommand,
  type ChatTurn,
  type MessageKind,
  type TuiContext,
  type TuiMessage,
} from "./commands";
import { t } from "../i18n";
import { newSessionName, saveSession } from "./sessions";

function kindLabel(kind: MessageKind): string {
  switch (kind) {
    case "user":
      return t("lblYou");
    case "system":
      return t("lblSystem");
    case "error":
      return t("lblError");
    case "task":
      return t("lblTask");
    default:
      return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const KIND_COLORS: Record<MessageKind, string> = {
  user: "cyan",
  coder: "green",
  viewer: "yellow",
  tester: "magenta",
  system: "gray",
  error: "red",
  task: "blue",
};

function Spinner({ label }: { label: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => v + 1), 90);
    return () => clearInterval(t);
  }, []);
  return (
    <Text color="yellow">
      {SPINNER_FRAMES[i % SPINNER_FRAMES.length]} {t("spinnerThinking", { role: label })}
    </Text>
  );
}

export function App(props: {
  mock: boolean;
  seats: ReturnType<typeof loadSeats>;
  registry?: ProviderRegistry;
  agentsDir: string;
  reportsDir: string;
  sessionsDir: string;
  repoRoot: string;
}) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<TuiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    detail: string;
    resolve: (a: "yes" | "always" | "no") => void;
  } | null>(null);
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
      sessionsDir: props.sessionsDir,
      session: { name: newSessionName() },
      repoRoot: props.repoRoot,
      approvalMode: "ask",
      askApproval: (detail) =>
        new Promise((resolve) => setPending({ detail, resolve })),
      messages: [] as TuiMessage[],
      chat: [] as ChatTurn[],
      // Static 依「新陣列參考」渲染新訊息——emit 必須給複本，原地修改它看不到
      emit: () => setMessages([...ctxRef.current!.messages]),
      busy: (role) => setBusy(role),
      exit: () => exit(),
    };
    ctxRef.current.messages.push({
      kind: "system",
      text: props.mock ? t("tuiWelcomeMock") : t("tuiWelcome"),
    });
    ctxRef.current.messages.push({
      kind: "system",
      text: t("sessionCurrent", { name: ctxRef.current.session.name }),
    });
  }
  const ctx = ctxRef.current;

  useEffect(() => {
    setMessages([...ctx.messages]);
  }, []);

  useInput((ch, key) => {
    if (pending) {
      const answer: "yes" | "always" | "no" | null =
        ch === "y" ? "yes" : ch === "a" ? "always" : ch === "n" ? "no" : null;
      if (answer) {
        const p = pending;
        setPending(null);
        p.resolve(answer);
      }
      return;
    }
    if (key.return) {
      const line = input;
      setInput("");
      if (!line.trim() || busy) return;
      historyRef.current.push(line);
      historyIdx.current = -1;
      void (async () => {
        await executeCommand(ctx, line);
        saveSession(ctx);
      })();
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
      <Static items={messages}>
        {(m: TuiMessage, i: number) => {
          const color = KIND_COLORS[m.kind];
          const label = kindLabel(m.kind);
          return (
            <Box key={i} flexDirection="column">
              <Box>
                <Text color={color} bold>
                  [{label}]{" "}
                </Text>
                <Text color={color}>{m.text}</Text>
              </Box>
              {m.meta ? (
                <Text dimColor>　└─ {m.meta}</Text>
              ) : null}
            </Box>
          );
        }}
      </Static>
      {busy && !pending ? <Spinner label={busy === "task" ? "管道" : busy} /> : null}
      {pending ? (
        <Box borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow" bold>
            {"🔑 " + t("approvalPrompt", { detail: pending.detail })}
          </Text>
        </Box>
      ) : null}
      <Box borderStyle="round" flexDirection="column" paddingX={1}>
        <Text dimColor>
          {props.mock ? "mock" : "real"} · {seatsLine} · {t("statusHints")}
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
    console.error(t("tuiNonTty"));
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
      sessionsDir={opts.root + "/reports/sessions"}
      repoRoot={opts.root}
    />,
  );
}
