import { useMemo, type CSSProperties } from 'react'
import type { CapabilityDefinition, CapabilityMethod, MethodIdentity } from './types'
import { methodColor as fixedMethodColor } from './palette'

function textStatus(value: unknown) {
  if (value === null || value === undefined || value === '') return 'NOT REPORTED'
  if (typeof value === 'boolean') return value ? 'YES' : 'NO'
  return String(value).trim() || 'NOT REPORTED'
}

function statusClass(value: unknown) {
  const text = textStatus(value).toLowerCase()
  if (['yes', 'supported', 'implemented', 'validated', 'true'].includes(text)) return 'yes'
  if (['no', 'unsupported', 'not implemented', 'not validated', 'false'].includes(text)) return 'no'
  if (text === 'unknown' || text === 'not reported' || text === 'n/a' || text === 'na') return 'unknown'
  return 'other'
}

function Status({ label, value }: { label: string; value: unknown }) {
  return <span className="capability-status-line">
    <small>{label}</small>
    <b className={`capability-status ${statusClass(value)}`}>{textStatus(value)}</b>
  </span>
}

function methodOrder(definitions: CapabilityDefinition[], identities: MethodIdentity[]) {
  const available = new Set(definitions.flatMap((definition) => definition.methods.map((method) => method.methodId)))
  const ordered = identities
    .filter((identity) => available.has(identity.methodId))
    .map((identity) => identity.methodId)
  const seen = new Set(ordered)
  for (const id of definitions.flatMap((definition) => definition.methods.map((method) => method.methodId))) {
    if (!seen.has(id)) { seen.add(id); ordered.push(id) }
  }
  return ordered
}

export default function CapabilityMatrix({ definitions, identities, query }: {
  definitions: CapabilityDefinition[]
  identities: MethodIdentity[]
  query: string
}) {
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    if (!search) return definitions
    return definitions.filter((item) => {
      const methodText = item.methods.map((method) => [method.methodName, method.family, method.nativeSupport, method.implementedInOurBenchmark, method.validatedInOurBenchmark, method.evidenceSource, method.notes].join(' ')).join(' ')
      return [item.id, item.name, item.description, item.whyItMatters, item.capabilityType, methodText].join(' ').toLocaleLowerCase().includes(search)
    })
  }, [definitions, query])
  const methodIds = useMemo(() => methodOrder(filtered, identities), [filtered, identities])
  const methodMap = useMemo(() => new Map(identities.map((method) => [method.methodId, method])), [identities])
  const groups = useMemo(() => {
    const grouped = new Map<string, CapabilityDefinition[]>()
    for (const definition of filtered) {
      const name = definition.capabilityType?.trim() || 'Other capabilities'
      grouped.set(name, [...(grouped.get(name) ?? []), definition])
    }
    return [...grouped.entries()]
  }, [filtered])

  if (!definitions.length) return <div className="section-empty"><span>◌</span><b>Capability matrix is waiting for the canonical export.</b><small>This view keeps support, benchmark implementation, and validation status categorical.</small></div>
  if (!filtered.length) return <div className="section-empty"><span>⌕</span><b>No capabilities match this filter.</b><small>Clear or change the search field above.</small></div>

  return <div className="capability-matrix-wrap">
    <div className="capability-matrix-summary"><b>{filtered.length}</b> definitions <span>·</span> <b>{methodIds.length}</b> method variants <span>·</span> categorical source labels retained, including UNKNOWN</div>
    {groups.map(([group, rows], groupIndex) => <details className="capability-group" key={group} open={groupIndex === 0}>
      <summary><span className="chevron">⌄</span>{group}<small>{rows.length} definitions</small></summary>
      <div className="capability-table-scroll" role="region" aria-label={`${group} capability matrix`} tabIndex={0}>
        <table className="capability-table">
          <thead><tr>
            <th className="capability-definition-head">CAPABILITY DEFINITION</th>
            {methodIds.map((methodId) => {
              const identity = methodMap.get(methodId)
              const rowMethod = rows.flatMap((row) => row.methods).find((method) => method.methodId === methodId)
              const name = identity?.label ?? rowMethod?.methodName ?? methodId
              const color = fixedMethodColor(methodId, identity?.family ?? rowMethod?.family)
              return <th className="capability-method-head" key={methodId} style={{ '--method-color': color } as CSSProperties}>
                <i />{name}<small>{identity?.family ?? rowMethod?.family ?? 'Method'} · {methodId}</small>
              </th>
            })}
          </tr></thead>
          <tbody>{rows.map((definition) => {
            const methods = new Map(definition.methods.map((method) => [method.methodId, method]))
            return <tr key={definition.id}>
              <th scope="row" className="capability-definition">
                <b>{definition.name}</b><code>{definition.id}</code>
                {definition.description && <span>{definition.description}</span>}
                {definition.whyItMatters && <small>Why it matters: {definition.whyItMatters}</small>}
              </th>
              {methodIds.map((methodId) => {
                const method = methods.get(methodId) as CapabilityMethod | undefined
                return <td key={methodId}>
                  {method ? <div className="capability-cell" title={[method.evidenceSource, method.notes].filter(Boolean).join(' · ') || undefined}>
                    <Status label="Native" value={method.nativeSupport} />
                    <Status label="Implemented" value={method.implementedInOurBenchmark} />
                    <Status label="Validated" value={method.validatedInOurBenchmark} />
                    {(method.evidenceSource || method.notes) && <details className="capability-evidence"><summary>Evidence</summary><div>
                      {method.evidenceSource && <span><small>Source</small>{String(method.evidenceSource)}</span>}
                      {method.notes && <span><small>Notes</small>{String(method.notes)}</span>}
                    </div></details>}
                  </div> : <span className="capability-not-reported">NOT REPORTED</span>}
                </td>
              })}
            </tr>
          })}</tbody>
        </table>
      </div>
    </details>)}
  </div>
}
