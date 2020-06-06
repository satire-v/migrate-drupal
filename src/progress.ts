import cliProgress, { SingleBar, MultiBar } from "cli-progress";

class ProgressBar {
  private __articlesProgressBar: SingleBar | null = null;
  private __filesProgressBar: SingleBar | null = null;
  private _multibar: MultiBar;

  private get _articlesProgressBar(): SingleBar {
    if (this.__articlesProgressBar) {
      return this.__articlesProgressBar;
    }
    this.start();
    return this.__articlesProgressBar!;
  }

  private get _filesProgressBar(): SingleBar {
    if (this.__filesProgressBar) {
      return this.__filesProgressBar;
    }
    this.start();
    return this.__filesProgressBar!;
  }

  constructor() {
    this._multibar = new cliProgress.MultiBar({
      format: "{value}/{total} | {percentage}% | {bar} | {message}",
      clearOnComplete: false,
      stream: process.stderr,
      noTTYOutput: false,
      notTTYSchedule: 0,
      forceRedraw: false,
      hideCursor: true,
    });
  }

  public start(): void {
    this.__articlesProgressBar = this._multibar.create(0, 0, {
      message: "Articles",
    });

    this.__filesProgressBar = this._multibar.create(0, 0, {
      message: "Files",
    });
  }

  public stop(): void {
    this._multibar.stop();
  }

  set FilesBarTotal(total: number) {
    this._filesProgressBar.setTotal(total);
  }

  set ArticlesBarTotal(total: number) {
    this._articlesProgressBar.setTotal(total);
  }

  incFilesBar(delta = 1): void {
    this._filesProgressBar.increment(delta);
  }

  incArticlesBar(): void {
    this._articlesProgressBar.increment();
  }
}

export default new ProgressBar();
