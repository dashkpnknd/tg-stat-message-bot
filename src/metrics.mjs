function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateSheetMetrics({
  leads,
  spend,
  vatRate = 0.22,
  bonusMultiplier = 0.5,
}) {
  const normalizedLeads = Number(leads) || 0;
  const normalizedSpend = Number(spend) || 0;
  const cpl = normalizedLeads > 0 ? normalizedSpend / normalizedLeads : 0;

  return {
    leads: normalizedLeads,
    spend: roundMoney(normalizedSpend),
    spendWithVat: roundMoney(normalizedSpend * (1 + vatRate)),
    cpl: roundMoney(cpl),
    cplWithBonus: roundMoney(cpl * bonusMultiplier),
  };
}
