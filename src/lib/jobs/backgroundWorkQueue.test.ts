import { describe, expect, it } from "vitest";

import { AsyncQueue } from "@/lib/async/asyncQueue";
import { runBackgroundWork } from "@/lib/jobs/backgroundWorkQueue";

/**
 * Le « background » de Next (`after()`) partage l'event loop du serveur : sans
 * plafond global, N enrichissements simultanés rendent les requêtes
 * interactives injoignables (AxiosError: Network Error côté navigateur).
 * Ces tests verrouillent la borne de concurrence et l'isolation des erreurs.
 */
describe("AsyncQueue", () => {
  it("ne dépasse jamais la concurrence configurée", async () => {
    const queue = new AsyncQueue(2);
    let active = 0;
    let maxActive = 0;

    const job = () =>
      queue.run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
      });

    await Promise.all(Array.from({ length: 10 }, job));
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("une tâche qui échoue ne bloque pas les suivantes", async () => {
    const queue = new AsyncQueue(1);
    const order: string[] = [];

    const failing = queue
      .run(async () => {
        order.push("fail");
        throw new Error("boom");
      })
      .catch(() => order.push("caught"));
    const following = queue.run(async () => {
      order.push("next");
    });

    await Promise.all([failing, following]);
    expect(order).toEqual(["fail", "caught", "next"]);
  });

  it("propage la valeur de retour", async () => {
    const queue = new AsyncQueue(1);
    await expect(queue.run(async () => 42)).resolves.toBe(42);
  });
});

describe("runBackgroundWork", () => {
  it("sérialise au-delà du plafond global (défaut 2)", async () => {
    let active = 0;
    let maxActive = 0;

    await Promise.all(
      Array.from({ length: 8 }, () =>
        runBackgroundWork(async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active--;
        }),
      ),
    );

    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
