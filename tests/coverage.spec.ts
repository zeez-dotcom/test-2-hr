import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const routes = ['/login', '/employees', '/payroll'];

interface ActionResult {
  action: string;
  result: string;
}

interface ElementRecord {
  route: string;
  selector: string;
  role: string | null;
  label: string;
  enabled: boolean;
  actions: ActionResult[];
}

const records: ElementRecord[] = [];

const baseURL = process.env.BASE_URL || 'http://localhost:5173';

for (const route of routes) {
  test(`UI coverage for ${route}`, async ({ page }) => {
    await page.goto(new URL(route, baseURL).toString());

    const locator = page.locator('[role="button"],[role="link"],input,select,textarea,[tabindex]');
    const count = await locator.count();

    for (let i = 0; i < count; i++) {
      const el = locator.nth(i);
      const selector = await el.evaluate(node => {
        const parts: string[] = [];
        while (node && node.nodeType === 1) {
          let part = node.nodeName.toLowerCase();
          const id = (node as HTMLElement).id;
          if (id) {
            part += `#${id}`;
            parts.unshift(part);
            break;
          }
          const className = (node as HTMLElement).className;
          if (className) {
            const cls = className.split(/\s+/)[0];
            if (cls) part += `.${cls}`;
          }
          parts.unshift(part);
          node = (node as HTMLElement).parentElement;
        }
        return parts.join(' > ');
      });

      const role = await el.getAttribute('role');
      const label = await el.innerText();
      const enabled = await el.isEnabled();

      const actions: ActionResult[] = [];
      for (const action of ['hover', 'focus', 'click', 'keyboard']) {
        try {
          switch (action) {
            case 'hover':
              await el.hover();
              break;
            case 'focus':
              await el.focus();
              break;
            case 'click':
              await el.click({ trial: true });
              break;
            case 'keyboard':
              await el.press('Enter');
              break;
          }
          actions.push({ action, result: 'success' });
        } catch (error) {
          actions.push({ action, result: (error as Error).message });
        }
      }

      records.push({ route, selector, role, label, enabled, actions });
    }
  });
}

test.afterAll(async () => {
  const reportDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, 'ui_coverage.json'),
    JSON.stringify(records, null, 2)
  );

  const header = 'route,selector,role,label,enabled,actions';
  const lines = records.map(r => {
    const actions = r.actions.map(a => `${a.action}:${a.result}`).join('|');
    const safe = (val: string) => '"' + val.replace(/"/g, '""') + '"';
    return [r.route, safe(r.selector), r.role ?? '', safe(r.label), r.enabled, safe(actions)].join(',');
  });
  fs.writeFileSync(
    path.join(reportDir, 'ui_coverage.csv'),
    [header, ...lines].join('\n')
  );
});

