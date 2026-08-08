#!/usr/bin/env tsx
import path from "node:path";

import { writeSourcesReport } from "@/providers/pokemontcglive/sources";

const cache = path.join(process.cwd(), "data/pokemon");
const report = await writeSourcesReport(cache);
console.log(JSON.stringify(report, null, 2));
