import { fetchFromLaunchBox } from "@/services/providers/launchbox/resolver";
import { resolveLaunchBoxPlatformNames, platformMatchesLaunchBoxEntry } from "@/services/providers/launchbox/platformMap";

async function main() {
  console.log("platform map 'Xbox Original' ->", resolveLaunchBoxPlatformNames("Xbox Original"));
  console.log("platform map 'xbox' ->", resolveLaunchBoxPlatformNames("xbox"));
  console.log("matches entry 'Microsoft Xbox'?", platformMatchesLaunchBoxEntry("Xbox Original", "Microsoft Xbox"));

  for (const [name, plat] of [
    ["Tom Clancy's Rainbow Six 3", "Xbox Original"],
    ["Tom Clancy's Rainbow Six 3", "xbox"],
    ["Halo", "Xbox Original"],
    ["Wallace & Gromit in Project Zoo", "Xbox Original"],
  ] as [string,string][]) {
    const res = await fetchFromLaunchBox(name, plat);
    console.log(`\n[${name} | ${plat}] ->`, res ? { title: res.title, facts: res.facts?.map(f=>f.kind), releaseDate: res.releaseDate } : "NULL");
  }
}
main().catch(console.error);
