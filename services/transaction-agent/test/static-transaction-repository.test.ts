import { describe, expect, it } from "vitest";
import { CUSTOMERS, PRODUCTS } from "../src/data/mock-core-banking";
import { StaticTransactionRepository } from "../src/repository/static-transaction-repository";

describe("StaticTransactionRepository — findCustomerByDocumentNumber", () => {
  const repo = new StaticTransactionRepository();

  it.each(CUSTOMERS)("encuentra al cliente %s por document_number", async (customer) => {
    const result = await repo.findCustomerByDocumentNumber(customer.document_number);
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.value.customer_id).toBe(customer.customer_id);
  });

  it("un document_number inexistente -> not_found, sin inventar un cliente", async () => {
    const result = await repo.findCustomerByDocumentNumber("NO-EXISTE-0000");
    expect(result.status).toBe("not_found");
  });
});

describe("StaticTransactionRepository — listCustomerProducts", () => {
  const repo = new StaticTransactionRepository();

  it("devuelve los productos del cliente, incluyendo al menos una tarjeta", async () => {
    const result = await repo.listCustomerProducts("CUST-0001");
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value.every((p) => p.customer_id === "CUST-0001")).toBe(true);
    expect(result.value.some((p) => p.product_type === "Credit Card" || p.product_type === "Debit Card")).toBe(true);
  });

  it("todos los clientes del seed tienen al menos una tarjeta (crédito o débito)", async () => {
    for (const customer of CUSTOMERS) {
      const result = await repo.listCustomerProducts(customer.customer_id);
      expect(result.status).toBe("found");
      if (result.status !== "found") continue;
      expect(result.value.some((p) => p.product_type === "Credit Card" || p.product_type === "Debit Card")).toBe(
        true
      );
    }
  });

  it("un customer_id inexistente -> not_found, nunca una lista vacía 'found'", async () => {
    const result = await repo.listCustomerProducts("CUST-9999");
    expect(result.status).toBe("not_found");
  });

  it("el seed de productos no depende de clientes que no existen (integridad interna del mock)", () => {
    const customerIds = new Set(CUSTOMERS.map((c) => c.customer_id));
    for (const product of PRODUCTS) {
      expect(customerIds.has(product.customer_id)).toBe(true);
    }
  });
});

describe("StaticTransactionRepository — findCandidateTransactions", () => {
  const repo = new StaticTransactionRepository();

  it("sin filtros, devuelve todas las transacciones del cliente", async () => {
    const result = await repo.findCandidateTransactions("CUST-0001");
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.value.length).toBe(6);
    expect(result.value.every((t) => t.customer_id === "CUST-0001")).toBe(true);
  });

  it("filtra por comercio, substring case-insensitive", async () => {
    const result = await repo.findCandidateTransactions("CUST-0001", { merchant: "amazon" });
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].merchant_name).toBe("Amazon MX");
  });

  it("filtra por monto con tolerancia (no requiere match exacto)", async () => {
    // TXN-000001: amount 1299.0 -- el cliente recuerda "como 1300"
    const result = await repo.findCandidateTransactions("CUST-0001", { amount: 1300 });
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.value.some((t) => t.transaction_id === "TXN-000001")).toBe(true);
  });

  it("un monto fuera de la tolerancia no matchea", async () => {
    const result = await repo.findCandidateTransactions("CUST-0001", { amount: 5000 });
    expect(result.status).toBe("not_found");
  });

  it("filtra por rango de fechas inclusive", async () => {
    const result = await repo.findCandidateTransactions("CUST-0001", {
      dateRange: { from: "2026-09-20", to: "2026-09-22" },
    });
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    const ids = result.value.map((t) => t.transaction_id).sort();
    expect(ids).toEqual(["TXN-000001", "TXN-000002"]);
  });

  it("combina comercio + monto + fecha para acotar a un único candidato", async () => {
    const result = await repo.findCandidateTransactions("CUST-0001", {
      merchant: "netflix",
      amount: 219,
      dateRange: { from: "2026-09-01", to: "2026-09-30" },
    });
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].transaction_id).toBe("TXN-000002");
  });

  it("un filtro que no matchea ninguna transacción -> not_found", async () => {
    const result = await repo.findCandidateTransactions("CUST-0001", { merchant: "comercio-inexistente" });
    expect(result.status).toBe("not_found");
  });

  it("un customer_id sin transacciones -> not_found", async () => {
    const result = await repo.findCandidateTransactions("CUST-9999");
    expect(result.status).toBe("not_found");
  });

  it("las transacciones sin merchant_name (ej. retiros) nunca matchean un filtro de comercio", async () => {
    const result = await repo.findCandidateTransactions("CUST-0001", { merchant: "cualquier cosa" });
    expect(result.status).toBe("not_found");
    // TXN-000004 es un retiro de cajero sin merchant_name -- confirmamos que
    // no aparece ni siquiera con filtros vacíos aplicados a mano.
  });

  it("expone la transacción marcada como fraude para el camino de ESCALATE", async () => {
    const result = await repo.findCandidateTransactions("CUST-0001", {
      dateRange: { from: "2026-09-15", to: "2026-09-15" },
    });
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].is_fraud).toBe(true);
    expect(result.value[0].fraud_score).toBeGreaterThan(90);
  });
});
