/* ════════════════════════════════════════════════════════════════════════
   Metas — auto-alocação: nº de meses e data estimada para atingir o objetivo
   ao reservar `monthly` por mês.
   ════════════════════════════════════════════════════════════════════════ */

// Meses necessários para cobrir `remaining` reservando `monthly`/mês.
export function monthsToTarget(remaining, monthly) {
  const r = Number(remaining) || 0;
  const m = Number(monthly) || 0;
  if (m <= 0 || r <= 0) return 0;
  return Math.ceil(r / m);
}

// Data estimada de conclusão (ou null se não aplicável).
export function etaDate(remaining, monthly, today) {
  const n = monthsToTarget(remaining, monthly);
  if (!n) return null;
  today = today || new Date();
  return new Date(today.getFullYear(), today.getMonth() + n, today.getDate());
}

// "mmm/aaaa" de uma data.
export function ymLabel(d) {
  if (!d) return '';
  return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

/* ── Metas em risco ──────────────────────────────────────────────────────
   Uma meta com prazo só se cumpre se a reserva mensal chegar para o que falta
   no tempo que resta. Devolve as que NÃO vão lá, com o que seria preciso.

   Cada item: { id, name, remaining, monthsLeft, monthly, needed, gap, deadline }
   - monthsLeft: meses inteiros até ao prazo (0 = o prazo é este mês)
   - needed: reserva mensal necessária para cumprir
   - gap: quanto falta à reserva atual (needed − monthly)
   Ignora metas sem prazo, já cumpridas, ou com prazo passado. */
export function goalsAtRisk(goals, today) {
  const now = today || new Date();
  const out = [];
  (goals || []).forEach((g) => {
    const target = Number(g.target) || 0;
    const current = Number(g.current) || 0;
    const remaining = target - current;
    if (remaining <= 0 || !g.deadline) return;
    const dl = new Date(g.deadline);
    if (isNaN(dl) || dl <= now) return;
    const monthsLeft = Math.max(
      0,
      (dl.getFullYear() - now.getFullYear()) * 12 + (dl.getMonth() - now.getMonth())
    );
    if (monthsLeft === 0) return; // prazo neste mês: já não há plano a corrigir
    const monthly = Number(g.monthly) || 0;
    const needed = remaining / monthsLeft;
    // Margem de 5% para não acusar por cêntimos.
    if (monthly > 0 && monthly * 1.05 >= needed) return;
    out.push({
      id: g.id,
      name: g.name,
      remaining,
      monthsLeft,
      monthly,
      needed,
      gap: needed - monthly,
      deadline: g.deadline,
    });
  });
  return out.sort((a, b) => a.monthsLeft - b.monthsLeft || b.gap - a.gap);
}
