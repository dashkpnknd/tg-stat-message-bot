export async function fetchMockStats(client) {
  if (!client.mockStats) {
    throw new Error(`Missing mockStats for ${client.clientName}`);
  }
  return {
    leads: client.mockStats.leads,
    spend: client.mockStats.spend,
  };
}
