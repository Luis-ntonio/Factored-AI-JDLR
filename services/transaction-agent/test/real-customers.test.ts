import { describe, expect, it } from "vitest";
import { REAL_CUSTOMERS, REAL_PRODUCTS, REAL_TRANSACTIONS } from "../src/data/real-customers";
import { CUSTOMERS, PRODUCTS, TRANSACTIONS } from "../src/data/mock-core-banking";

/**
 * Sanity checks sobre los 2 clientes REALES del dataset del hackathon
 * (ver docstring de `real-customers.ts` -- autorizado explícitamente por
 * el usuario, extraído con DuckDB el 2026-10-02). No valida los VALORES de
 * negocio (son datos reales, no inventados acá) -- valida integridad
 * referencial y la única regla deliberada (email sobrescrito), para
 * atrapar errores de copiado/transcripción, no para "testear el dataset".
 */
describe("REAL_CUSTOMERS/REAL_PRODUCTS/REAL_TRANSACTIONS -- integridad referencial", () => {
  it("cada producto real pertenece a un cliente real que existe", () => {
    const customerIds = new Set(REAL_CUSTOMERS.map((c) => c.customer_id));
    for (const product of REAL_PRODUCTS) {
      expect(customerIds.has(product.customer_id)).toBe(true);
    }
  });

  it("cada transacción real pertenece a un producto real que existe, del mismo cliente", () => {
    const productsById = new Map(REAL_PRODUCTS.map((p) => [p.product_id, p]));
    for (const txn of REAL_TRANSACTIONS) {
      const product = productsById.get(txn.product_id);
      expect(product).toBeDefined();
      expect(product?.customer_id).toBe(txn.customer_id);
    }
  });

  it("todas las transacciones reales son Purchase con merchant_name (requisito del flujo de disputa)", () => {
    for (const txn of REAL_TRANSACTIONS) {
      expect(txn.transaction_type).toBe("Purchase");
      expect(txn.merchant_name).toBeTruthy();
    }
  });

  it("al menos una transacción real por cliente está marcada is_fraud=true (dato real, no inventado)", () => {
    for (const customer of REAL_CUSTOMERS) {
      const hasFraud = REAL_TRANSACTIONS.some((t) => t.customer_id === customer.customer_id && t.is_fraud);
      expect(hasFraud).toBe(true);
    }
  });

  it("el email de cada cliente real está sobrescrito al inbox del equipo (nunca se le escribe a la persona real)", () => {
    const emails = new Set(REAL_CUSTOMERS.map((c) => c.email));
    expect(emails.size).toBe(1);
    expect([...emails][0]).toMatch(/^[^@]+@[^@]+$/);
  });

  it("CUSTOMERS/PRODUCTS/TRANSACTIONS exportados incluyen tanto el mock de autoría como los 2 clientes reales", () => {
    for (const customer of REAL_CUSTOMERS) {
      expect(CUSTOMERS).toContainEqual(customer);
    }
    for (const product of REAL_PRODUCTS) {
      expect(PRODUCTS).toContainEqual(product);
    }
    for (const txn of REAL_TRANSACTIONS) {
      expect(TRANSACTIONS).toContainEqual(txn);
    }
    // Los 4 clientes de autoría originales siguen ahí -- esto es aditivo,
    // nunca un reemplazo.
    expect(CUSTOMERS.length).toBe(4 + REAL_CUSTOMERS.length);
  });
});
