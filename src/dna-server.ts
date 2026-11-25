import { Platform } from "obsidian";
import type { ChildProcess } from "child_process";
import { ui } from "./i18n";

const endpoint = "http://127.0.0.1:18081/v1";

export interface DnaPaths {
	pluginDir: string;
	engine: string;
	model: string;
	alias: string;
	context: number;
}

export class DnaServer {
	private child: ChildProcess | undefined;
	private starting?: Promise<string>;
	private activeConfig = "";

	ensureStarted(listModels: () => Promise<{ name: string }[]>, paths: DnaPaths): Promise<string> {
		this.starting ??= this.start(listModels, paths).finally(() => { this.starting = undefined; });
		return this.starting;
	}

	private async start(listModels: () => Promise<{ name: string }[]>, paths: DnaPaths): Promise<string> {
		const config = JSON.stringify(paths);
		if (this.child && config !== this.activeConfig) {
			const previous = this.child;
			await new Promise<void>((resolve, reject) => {
				const timer = window.setTimeout(() => reject(new Error("서버 종료 대기 시간이 초과되었습니다.")), 10000);
				previous.once("close", () => { window.clearTimeout(timer); resolve(); });
				previous.kill();
			});
		}
		const verifyModel = async () => {
			const models = await listModels();
			if (!models.some((model) => model.name === paths.alias)) {
				throw new Error(ui("The server returned a different model.", "서버의 모델과 선택한 모델 이름이 다릅니다. 외부 서버를 종료하거나 모델 설정을 확인하세요."));
			}
		};
		const reachable = await listModels().then(() => true, () => false);
		if (reachable) {
			await verifyModel();
			return ui("Local model server is already running.", "로컬 모델 서버가 이미 실행 중입니다.");
		}
		if (this.child) throw new Error(ui("The server is starting.", "서버를 시작하는 중입니다."));

		if (!Platform.isDesktop || !Platform.isWin) {
			throw new Error(ui("Automatic local model startup requires Windows desktop.", "로컬 모델 자동 시작은 Windows 데스크톱에서 사용할 수 있습니다."));
		}
		const { spawn } = require("child_process") as typeof import("child_process");
		const path = require("path") as typeof import("path");
		const { stat } = (require("fs") as typeof import("fs")).promises;
		const engine = paths.engine || path.join(paths.pluginDir, "engine", "llama-server.exe");
		const model = paths.model || path.join(paths.pluginDir, "models", "DNA3.0-9B.Q4_K_M.gguf");
		for (const file of [engine, model]) {
			if (!path.isAbsolute(file) || !await stat(file).then((info) => info.isFile(), () => false)) {
				throw new Error(ui("Check the absolute file path in Local Vault Agent settings.", "Local Vault Agent 설정에서 파일의 절대 경로를 확인하세요.") + " " + file);
			}
		}
		const child = spawn(engine, [
			"-m", model,
			"--alias", paths.alias, "--host", "127.0.0.1", "--port", "18081",
			"-ngl", "99", "-c", String(paths.context), "-np", "1", "--no-webui", "--jinja", "--reasoning-budget", "0",
		], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
		this.child = child;
		this.activeConfig = config;
		let error: Error | undefined;
		let diagnostics = "";
		child.stderr?.on("data", (chunk: Buffer) => { diagnostics = (diagnostics + chunk.toString()).slice(-2000); });
		child.once("error", (err) => { error = err; });
		child.once("close", () => { if (this.child === child) this.child = undefined; });

		try {
			const deadline = Date.now() + 90000;
			while (this.child === child && !error && child.exitCode === null && Date.now() < deadline) {
				const online = await listModels().then(() => true, () => false);
				if (online) {
					await verifyModel();
					return ui("Local model server ready.", "로컬 모델 서버가 준비되었습니다.");
				}
				await new Promise<void>((resolve) => window.setTimeout(resolve, 1000));
			}
			console.error("Local Vault Agent Local model server:", error ?? diagnostics);
			throw new Error(ui("The Local model server could not start. Check the model file, port, and GPU memory.", "로컬 모델 서버를 시작하지 못했습니다. 모델 파일, 포트, GPU 메모리를 확인하세요."));
		} catch (err) {
			if (this.child === child) this.stop();
			throw err;
		}
	}

	stop(): boolean {
		return this.child?.kill() ?? false;
	}
}

export function isDnaEndpoint(url: string): boolean {
	return url.replace(/\/+$/, "") === endpoint;
}

