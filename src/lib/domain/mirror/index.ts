/**
 * Conducks — the mirror's door.
 *
 * The live dashboard was spread across four places with no owner: a launcher in `interfaces/cli`, an
 * express server in `interfaces/web`, its data service filed under `domain/analysis`, and a dead
 * engine in `domain/visual` that three ADRs had emptied and none had removed (ADR 0190). Nothing was
 * wrong with the layering; what was missing was a name. A feature reachable at four paths is a
 * feature nobody can change, because every edit means checking all four.
 *
 * So the DATA half gets one door. `GatewayService` answers the visual wave from SQL (ADR 0054) and
 * hydrates a node on demand — it belongs to the mirror, not to analysis, which is where it sat only
 * because that door already existed.
 *
 * The other half is `src/interfaces/web/mirror/` — the express server and, beside it under `public/`,
 * the page itself. The mirror spans two layers because it genuinely is two things, and the contract
 * runs one way: a domain door may not hold an interface asset. Two folders, one per layer, is the
 * closest this feature can legally come to living in one place.
 *
 * `tests/architecture/feature-doors.test.ts` fails when anything outside reaches past this file.
 */
export { GatewayService } from "./gateway.js";
