#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'shared/src/i18n')
const locales = fs.readdirSync(root).filter(d =>
  fs.statSync(path.join(root, d)).isDirectory() && d !== 'externalNotifications',
)

const mapKeys = {
  'map.route.distanceDuration': '{distance} · {duration}',
  'map.route.lockDelay': '+{delay} locks',
  'map.route.fallbackRowing': '{distance} · {duration} ({speed} km/h rowing, fallback)',
  'map.route.gearShuttle': '{distance} · {duration} (gear shuttle)',
  'map.waterway.contextTitle': 'Waterway context',
  'map.waterway.tideDetected': 'detected',
  'map.waterway.unavailable': 'unavailable',
  'map.lock.title': 'Lock',
  'map.lock.alongRoute': '{km} km along route · +{delay}',
}

const dashboardKeys = {
  'dashboard.routeLegDefaultWalking': 'Walk (OSRM foot)',
  'dashboard.routeLegDefaultDriving': 'Drive (OSRM car)',
  'dashboard.routeLegDefaultWaterway': 'Row on waterways',
  'dashboard.routeLegDefaultHint':
    'Used from each stop to the next unless you override the leg on that stop.',
}

const inspectorKeys = {
  'inspector.routeLegLabel': 'Route from this stop to the next',
  'inspector.routeLegInheritHelp':
    '"Trip default" uses the mode set on the trip form (rowing by waterway, walking, or driving).',
  'inspector.routeLegRouteCalcHint':
    'Turn on route calculation in Settings -> Map to draw waterways and roads on the map.',
  'inspector.routeLegInherit': 'Trip default',
  'inspector.routeLegWaterway': 'Row by waterway',
  'inspector.routeLegWalking': 'Walk',
  'inspector.routeLegDriving': 'Drive',
}

function mergeKeys(filePath, keys) {
  if (!fs.existsSync(filePath)) return
  let src = fs.readFileSync(filePath, 'utf8')
  for (const [key, value] of Object.entries(keys)) {
    if (src.includes(`'${key}'`)) continue
    const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const line = `  '${key}': '${escaped}',`
    src = src.replace(/(\n};\nexport default)/, `\n${line}$1`)
  }
  fs.writeFileSync(filePath, src)
}

for (const loc of locales) {
  mergeKeys(path.join(root, loc, 'map.ts'), mapKeys)
  mergeKeys(path.join(root, loc, 'dashboard.ts'), dashboardKeys)
  mergeKeys(path.join(root, loc, 'inspector.ts'), inspectorKeys)
  console.log('updated', loc)
}
