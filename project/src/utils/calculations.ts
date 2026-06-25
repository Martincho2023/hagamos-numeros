export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDate = (date: string): string => {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
};

export interface CalculationResult {
  subtotal: number;
  tip: number;
  totalExtra: number;
  total: number;
  balances: { name: string; balance: number; isRecaudador: boolean }[];
  transfers: { from: string; to: string; amount: number }[];
}

export const calculateBarMode = (
  total: number, // Ticket total ($10.000)
  tipPercentage: number,
  participants: { name: string; extra_amount: number; is_recaudador: boolean; pago_efectivo: boolean }[]
): CalculationResult => {
  const numParticipants = participants.length;
  if (numParticipants === 0) {
    return { subtotal: total, tip: 0, totalExtra: 0, total: total, balances: [], transfers: [] };
  }

  // 1. Calculamos el total con propina (sobre el ticket total)
 const tip = Math.round((total * tipPercentage) / 100);
  const grandTotal = total + tip; // $22.000
  
  const totalExtra = participants.reduce((sum, p) => sum + Number(p.extra_amount || 0), 0);
  
  // Para que el total sea 22.000, no sumamos totalExtra aquí.
  const montoADividir = grandTotal - totalExtra; 
  const basePerPerson = montoADividir / numParticipants;

  let balances = participants.map((p) => {
    const extra = Number(p.extra_amount || 0);
    return {
      name: p.name,
      balance: Math.round(basePerPerson + extra),
      isRecaudador: p.is_recaudador,
    };
  });

  // 5. Ajuste de redondeo (para asegurar que la suma de balances sea exactamente el grandTotal)
  const totalSaldos = balances.reduce((sum, b) => sum + b.balance, 0);
  const diferencia = grandTotal - totalSaldos;
  
  const indexRecaudador = balances.findIndex(b => b.isRecaudador);
  if (indexRecaudador !== -1) {
    balances[indexRecaudador].balance += diferencia;
  }

  // 6. Transferencias (solo quienes no pagaron en efectivo)
  const recaudador = balances.find((b) => b.isRecaudador);
  const transfers: { from: string; to: string; amount: number }[] = [];

  if (recaudador) {
    participants.forEach((p) => {
      if (!p.is_recaudador && !p.pago_efectivo) {
        const pBalance = balances.find(b => b.name === p.name);
        if (pBalance && pBalance.balance > 0) {
          transfers.push({ from: p.name, to: recaudador.name, amount: pBalance.balance });
        }
      }
    });
  }

return {
    subtotal: total,
    tip,
    totalExtra,
    total: grandTotal, // <-- Esto mostrará $22.000 en pantalla
    balances,
    transfers,
  };
};

export const calculateCasaMode = (
  participants: { name: string; amount_spent: number; extra_amount: number }[]
): CalculationResult => {
  // 1. Calculamos totales básicos
  const subtotal = participants.reduce((sum, p) => sum + Number(p.amount_spent || 0), 0);
  const totalExtra = participants.reduce((sum, p) => sum + Number(p.extra_amount || 0), 0);
  const grandTotal = subtotal + totalExtra;
  const fairShare = participants.length > 0 ? grandTotal / participants.length : 0;

  // 2. Calculamos balances individuales
  const balances = participants.map(p => ({
    name: p.name,
    balance: Math.round((p.amount_spent + p.extra_amount) - fairShare),
    isRecaudador: false // En modo casa no hay recaudador central
  }));

  // 3. Calculamos transferencias (Deudores vs Acreedores)
  const deudores = balances.filter(s => s.balance < 0);
  const acreedores = balances.filter(s => s.balance > 0);
  
  const transfers: { from: string; to: string; amount: number }[] = [];

  // Necesitamos una copia mutable de los acreedores para ir "vaciándolos"
  let acreedoresCopy = acreedores.map(a => ({ ...a }));

  deudores.forEach(deudor => {
    let montoDeuda = Math.abs(deudor.balance);
    
    for (let acreedor of acreedoresCopy) {
      if (montoDeuda === 0) break;
      if (acreedor.balance > 0) {
        let pago = Math.min(montoDeuda, acreedor.balance);
        transfers.push({ from: deudor.name, to: acreedor.name, amount: pago });
        acreedor.balance -= pago;
        montoDeuda -= pago;
      }
    }
  });

  return {
    subtotal,
    tip: 0,
    totalExtra,
    total: grandTotal,
    balances,
    transfers
  };
};