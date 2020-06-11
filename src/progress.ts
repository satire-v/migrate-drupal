import cliProgress, { SingleBar, MultiBar } from "cli-progress";

class ProgressBar {
  private _articlesProgressBar: SingleBar | null = null;
  private _filesProgressBar: SingleBar | null = null;
  private _multibar: MultiBar;

  private get articlesProgressBar(): SingleBar {
    if (this._articlesProgressBar) {
      return this._articlesProgressBar;
    } else {
      this._articlesProgressBar = this._multibar.create(0, 0, {
        message: "Articles",
      });
    }
    return this._articlesProgressBar;
  }

  private get filesProgressBar(): SingleBar {
    if (this._filesProgressBar) {
      return this._filesProgressBar;
    }
    this._filesProgressBar = this._multibar.create(0, 0, {
      message: "Files",
    });
    return this._filesProgressBar;
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

  public stop(): void {
    this._multibar.stop();
  }

  set FilesBarTotal(total: number) {
    this.filesProgressBar.setTotal(total);
  }

  set ArticlesBarTotal(total: number) {
    this.articlesProgressBar.setTotal(total);
  }

  incFilesBar(delta = 1): void {
    this.filesProgressBar.increment(delta);
  }

  incArticlesBar(): void {
    this.articlesProgressBar.increment();
  }
}

export default new ProgressBar();
