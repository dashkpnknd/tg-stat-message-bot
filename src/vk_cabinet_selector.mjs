export function selectCabinetExpression(cabinetId) {
  return `(() => {
    const id = ${JSON.stringify(String(cabinetId))};
    if (!document.querySelector('[class*="accountsDropdown"]')) {
      document.querySelector('[class*="changeAccountButton"]')?.click();
    }
    const candidates = Array.from(document.querySelectorAll('[role="button"], [class*="account"]'));
    const target = candidates.find((el) => (el.innerText || '').includes('ID: ' + id));
    if (!target) return { ok: false, error: 'cabinet_not_found' };
    target.scrollIntoView({ block: 'center' });
    target.click();
    return { ok: true };
  })()`;
}
