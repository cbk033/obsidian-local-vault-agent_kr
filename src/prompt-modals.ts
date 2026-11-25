import { ui } from "./i18n";
import { App, Modal, Setting } from "obsidian";
import type { ProcessDailyOptions } from "./prompts";
import type { TuneAdvice } from "./tune";

/** Shows the auto-tune verdict with one-click buttons for what it suggests. */
export class TuneModal extends Modal {
	private resolve!: (choice: { numCtx?: number; model?: string } | null) => void;
	readonly result: Promise<{ numCtx?: number; model?: string } | null>;
	private done = false;

	constructor(
		app: App,
		private advice: TuneAdvice,
		private connection: string,
	) {
		super(app);
		this.result = new Promise((res) => (this.resolve = res));
	}

	onOpen(): void {
		const { contentEl, titleEl, modalEl } = this;
		modalEl.addClass("lva-options-modal");
		titleEl.setText(ui("Connection and speed test", "연결 및 속도 테스트"));
		contentEl.createEl("p", { cls: "lva-modal-help", text: this.connection });
		contentEl.createEl("p", { cls: "lva-tune-headline", text: this.advice.headline });
		const list = contentEl.createEl("ul", { cls: "lva-tune-lines" });
		for (const line of this.advice.lines) list.createEl("li", { text: line });
		const buttons = new Setting(contentEl);
		if (this.advice.suggestedNumCtx) {
			const n = this.advice.suggestedNumCtx;
			buttons.addButton((b) =>
				b
					.setButtonText(`Use a ${Math.round(n / 1024)}k context`)
					.setCta()
					.onClick(() => this.finish({ numCtx: n })),
			);
		}
		if (this.advice.suggestedModel) {
			const name = this.advice.suggestedModel;
			buttons.addButton((b) => b.setButtonText(`Switch to ${name}`).onClick(() => this.finish({ model: name })));
		}
		buttons.addButton((b) => b.setButtonText(ui("Close", "닫기")).onClick(() => this.finish(null)));
	}

	private finish(choice: { numCtx?: number; model?: string } | null): void {
		if (this.done) return;
		this.done = true;
		this.resolve(choice);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		this.finish(null);
	}
}

/** Options for "Process my daily notes", prefilled from settings and the Daily Notes plugin. */
export class ProcessDailyModal extends Modal {
	private resolve!: (o: ProcessDailyOptions | null) => void;
	readonly result: Promise<ProcessDailyOptions | null>;
	private done = false;
	private opts: ProcessDailyOptions;

	constructor(
		app: App,
		initial: ProcessDailyOptions,
		private today: Date = new Date(),
	) {
		super(app);
		this.opts = { ...initial };
		this.result = new Promise((res) => (this.resolve = res));
	}

	onOpen(): void {
		const { contentEl, titleEl, modalEl } = this;
		modalEl.addClass("lva-options-modal");
		titleEl.setText(ui("Process my daily notes", "일일 노트 정리"));
		contentEl.createEl("p", {
			cls: "lva-modal-help",
			text: ui("The agent surveys the inbox section of every daily note, compiles the substantial ones into topic notes with links back to the source days, and can replace each compiled inbox with a link. Every write is shown as a diff first.", "일일 노트의 수집 섹션을 읽어 주제별로 정리하고 원본 날짜로 연결합니다. 정리한 섹션을 주제 노트 링크로 바꿀 수 있습니다. 저장 전에 변경사항을 표시합니다."),
		});

		new Setting(contentEl)
			.setName(ui("Daily notes folder", "일일 노트 폴더"))
			.setDesc(ui("Read from the Daily Notes plugin; empty means the vault root.", "일일 노트 플러그인에서 폴더를 읽습니다. 비워 두면 Vault 최상위를 사용합니다."))
			.addText((t) => t.setValue(this.opts.folder).onChange((v) => (this.opts.folder = v.trim())));

		new Setting(contentEl)
			.setName(ui("Inbox heading", "수집 섹션 제목"))
			.setDesc(ui("The section inside each daily note that collects loose captures, without the #.", "일일 노트에서 메모를 모아 두는 섹션 제목을 # 없이 입력합니다."))
			.addText((t) => t.setValue(this.opts.heading).onChange((v) => (this.opts.heading = v.trim() || "Capture")));

		new Setting(contentEl)
			.setName(ui("Topic notes folder", "주제 노트 폴더"))
			.setDesc(ui("Where compiled notes are created; empty means the vault root.", "통합 노트를 저장할 폴더입니다. 비워 두면 Vault 최상위를 사용합니다."))
			.addText((t) => t.setValue(this.opts.destination).onChange((v) => (this.opts.destination = v.trim())));

		new Setting(contentEl)
			.setName(ui("Look back", "대상 기간"))
			.addDropdown((d) => {
				d.addOption("all", "All daily notes");
				d.addOption("30", "Last 30 days");
				d.addOption("90", "Last 90 days");
				d.addOption("365", "Last year");
				d.setValue("all");
				d.onChange((v) => {
					if (v === "all") delete this.opts.since;
					else {
						const since = new Date(this.today.getTime() - Number(v) * 86_400_000);
						this.opts.since = since.toISOString().slice(0, 10);
					}
				});
			});

		new Setting(contentEl)
			.setName(ui("Move compiled inboxes out of the daily notes", "정리한 메모를 일일 노트에서 이동"))
			.setDesc(ui("Replace each compiled inbox with '- Moved to [[Topic]]'. Off keeps daily notes unchanged.", "정리한 수집 섹션을 주제 노트 링크로 바꿉니다. 끄면 일일 노트를 그대로 둡니다."))
			.addToggle((t) => t.setValue(this.opts.move).onChange((v) => (this.opts.move = v)));

		new Setting(contentEl)
			.addButton((b) => b.setButtonText(ui("Cancel", "취소")).onClick(() => this.finish(null)))
			.addButton((b) =>
				b
					.setButtonText(ui("Run", "실행"))
					.setCta()
					.onClick(() => this.finish(this.opts)),
			);
	}

	private finish(o: ProcessDailyOptions | null): void {
		if (this.done) return;
		this.done = true;
		this.resolve(o);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		this.finish(null);
	}
}

/** One-line instruction for "Edit the selected text". Enter runs, Escape cancels. */
export class InstructionModal extends Modal {
	private resolve!: (s: string | null) => void;
	readonly result: Promise<string | null>;
	private done = false;
	private value = "";

	constructor(
		app: App,
		private preview: string,
	) {
		super(app);
		this.result = new Promise((res) => (this.resolve = res));
	}

	onOpen(): void {
		const { contentEl, titleEl, modalEl } = this;
		modalEl.addClass("lva-options-modal");
		titleEl.setText(ui("Edit the selected text", "선택 영역 편집"));
		const quote = contentEl.createEl("pre", { cls: "lva-modal-preview" });
		quote.setText(this.preview.length > 400 ? this.preview.slice(0, 400) + "…" : this.preview);
		new Setting(contentEl).setName(ui("Instruction", "편집 지시")).setDesc(ui("What should change? e.g. 'is a markdown table', 'reads as one tight paragraph', 'is in the past tense'.", "어떻게 바꿀지 입력하세요. 예: Markdown 표로 만들기, 한 문단으로 다듬기, 과거형으로 바꾸기.")).addText((t) => {
			t.setPlaceholder("make this a bullet list");
			t.onChange((v) => (this.value = v));
			t.inputEl.addClass("lva-modal-input");
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && this.value.trim()) {
					e.preventDefault();
					this.finish(this.value.trim());
				}
			});
			window.setTimeout(() => t.inputEl.focus(), 0);
		});
		new Setting(contentEl)
			.addButton((b) => b.setButtonText(ui("Cancel", "취소")).onClick(() => this.finish(null)))
			.addButton((b) =>
				b
					.setButtonText(ui("Edit", "편집"))
					.setCta()
					.onClick(() => this.finish(this.value.trim() || null)),
			);
	}

	private finish(s: string | null): void {
		if (this.done) return;
		this.done = true;
		this.resolve(s);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		this.finish(null);
	}
}
