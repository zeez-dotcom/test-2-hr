import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';

class BrowserMatrixReporter implements Reporter {
  private results: Record<string, boolean> = {};

  onTestEnd(test: TestCase, result: TestResult) {
    const projectName = test.parent.project().name;
    const passed = result.status === 'passed';
    this.results[projectName] = (this.results[projectName] ?? true) && passed;
  }

  onEnd() {
    const reportDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(reportDir, { recursive: true });
    const matrix = Object.entries(this.results).map(([browser, passed]) => ({
      browser,
      status: passed ? 'passed' : 'failed'
    }));
    fs.writeFileSync(path.join(reportDir, 'browser-matrix.json'), JSON.stringify(matrix, null, 2));
  }
}

export default BrowserMatrixReporter;
