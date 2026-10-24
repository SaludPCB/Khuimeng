import { afterEach, describe, expect, it } from "vitest";
import { createProvider, createRegistry, NVIDIA_BASE_URL } from "../src/llm/factory";

const SAVED = process.env.NVIDIA_API_KEY;

afterEach(() => {
  if (SAVED === undefined) delete process.env.NVIDIA_API_KEY;
  else process.env.NVIDIA_API_KEY = SAVED;
});

describe("nvidia 供應商（OpenAI 相容通用轉接器）", () => {
  it("帶 key 可建、名稱正確", () => {
    const p = createProvider("nvidia", "nvapi-test");
    expect(p?.name).toBe("nvidia");
  });

  it("無 key 且無環境變數時回 undefined（fail-closed，不誤建）", () => {
    delete process.env.NVIDIA_API_KEY;
    expect(createProvider("nvidia")).toBeUndefined();
  });

  it("環境變數 NVIDIA_API_KEY 亦可", () => {
    delete process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = "nvapi-env";
    expect(createProvider("nvidia")?.name).toBe("nvidia");
  });

  it("baseUrl 覆寫（換任何 OpenAI 相容廠商端點）", () => {
    const p = createProvider("nvidia", "k", "https://api.groq.com/openai/v1/");
    expect(p).toBeDefined();
  });

  it("預設端點為 NVIDIA NIM", () => {
    expect(NVIDIA_BASE_URL).toBe("https://integrate.api.nvidia.com/v1");
  });
});

describe("createRegistry：nvidia 註冊", () => {
  it("有環境變數時 registry 查得到 nvidia", () => {
    process.env.NVIDIA_API_KEY = "nvapi-env";
    const reg = createRegistry();
    expect(reg.get("nvidia")?.name).toBe("nvidia");
  });
});
