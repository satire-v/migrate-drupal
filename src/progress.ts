import cliProgress, { SingleBar, MultiBar } from "cli-progress";

class ProgressBar {
  private _articlesProgressBar: SingleBar;
  private _filesProgressBar: SingleBar;
  private _multibar: MultiBar;

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
    this._articlesProgressBar = this._multibar.create(0, 0, {
      message: "Articles",
    });

    this._filesProgressBar = this._multibar.create(0, 0, {
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
