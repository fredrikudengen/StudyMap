import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { authFetch } from '../api'

const NODE_W = 160
const NODE_H = 60

const STATUS_COLOR = {
  kan_godt:    '#16a34a',
  usikker:     '#ef4444',
  ikke_testet: '#94a3b8',
}

const EDGE_DEFAULT = '#94a3b8'
const EDGE_SELECTED = '#3b82f6'

function applyDagreLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 })

  nodes.forEach(node => g.setNode(node.id, { width: NODE_W, height: NODE_H }))
  edges.forEach(edge => g.setEdge(edge.source, edge.target))

  dagre.layout(g)

  return nodes.map(node => {
    const { x, y } = g.node(node.id)
    return { ...node, position: { x: x - NODE_W / 2, y: y - NODE_H / 2 } }
  })
}

function topicToNode(topic) {
  return {
    id: String(topic.id),
    data: { label: topic.name },
    position: { x: 0, y: 0 },
    style: {
      background: '#ffffff',
      border: 'none',
      borderLeft: `4px solid ${STATUS_COLOR[topic.status]}`,
      borderRadius: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      padding: '8px 14px',
      fontSize: 13,
      fontWeight: 500,
      color: '#374151',
      width: 170,
      textAlign: 'left',
    },
  }
}

function depToEdge(dep) {
  return {
    id: String(dep.id),
    source: String(dep.from_topic_id),
    target: String(dep.to_topic_id),
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_DEFAULT, width: 14, height: 14 },
    style: { stroke: EDGE_DEFAULT, strokeWidth: 1.5 },
  }
}

export default function GraphPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedEdgeId, setSelectedEdgeId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch(`/api/subjects/${id}/graph`)
        if (!res.ok) throw new Error('Kunne ikke hente graf')
        const data = await res.json()
        const rawNodes = data.topics.map(topicToNode)
        const rawEdges = data.dependencies.map(depToEdge)
        setNodes(applyDagreLayout(rawNodes, rawEdges))
        setEdges(rawEdges)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const onConnect = useCallback(async (params) => {
    try {
      const res = await authFetch(`/api/subjects/${id}/graph/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_topic_id: Number(params.source),
          to_topic_id: Number(params.target),
        }),
      })
      if (!res.ok) return
      const dep = await res.json()
      setEdges(eds => addEdge(depToEdge(dep), eds))
    } catch {}
  }, [id, setEdges])

  function onEdgeClick(_, edge) {
    setSelectedEdgeId(prev => (prev === edge.id ? null : edge.id))
  }

  function onPaneClick() {
    setSelectedEdgeId(null)
  }

  async function handleDeleteEdge() {
    if (!selectedEdgeId) return
    try {
      const res = await authFetch(`/api/topic-dependencies/${selectedEdgeId}`, { method: 'DELETE' })
      if (!res.ok) return
      setEdges(eds => eds.filter(e => e.id !== selectedEdgeId))
      setSelectedEdgeId(null)
    } catch {}
  }

  const styledEdges = edges.map(e => {
    const selected = e.id === selectedEdgeId
    return {
      ...e,
      style: { stroke: selected ? EDGE_SELECTED : EDGE_DEFAULT, strokeWidth: selected ? 2 : 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: selected ? EDGE_SELECTED : EDGE_DEFAULT, width: 14, height: 14 },
    }
  })

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: '#f8fafc' }}>
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Laster graf...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f8fafc' }}>
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#f8fafc', position: 'relative' }}>

      {/* Top-left toolbar */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => navigate(`/subjects/${id}/topics`)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#ffffff', border: '1px solid #e2e8f0',
            borderRadius: 9999, padding: '6px 14px',
            fontSize: 13, fontWeight: 500, color: '#374151',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
            cursor: 'pointer',
          }}
        >
          ← Tilbake
        </button>

        {selectedEdgeId && (
          <button
            onClick={handleDeleteEdge}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#fff1f2', border: '1px solid #fecdd3',
              borderRadius: 9999, padding: '6px 14px',
              fontSize: 13, fontWeight: 500, color: '#e11d48',
              boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
              cursor: 'pointer',
            }}
          >
            ✕ Slett kant
          </button>
        )}
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', top: 16, right: 16, zIndex: 10,
        display: 'flex', gap: 14, alignItems: 'center',
        background: '#ffffff', border: '1px solid #e2e8f0',
        borderRadius: 12, padding: '8px 16px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
      }}>
        {[
          { color: STATUS_COLOR.kan_godt, label: 'Kan godt' },
          { color: STATUS_COLOR.usikker,  label: 'Usikker' },
          { color: STATUS_COLOR.ikke_testet, label: 'Ikke testet' },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
            {label}
          </span>
        ))}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        deleteKeyCode={null}
        fitView
      >
        <Background variant="dots" color="#cbd5e1" gap={20} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  )
}
