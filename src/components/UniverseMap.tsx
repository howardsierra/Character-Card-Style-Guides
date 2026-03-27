import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { UniverseData, UniverseNode, UniverseLink } from '../lib/api';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';

interface UniverseMapProps {
  data: UniverseData;
  onAddLink?: (sourceId: string, targetId: string, type: "relationship" | "pipeline", label: string) => void;
}

export default function UniverseMap({ data, onAddLink }: UniverseMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<UniverseNode | null>(null);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newLinkTarget, setNewLinkTarget] = useState("");
  const [newLinkType, setNewLinkType] = useState<"relationship" | "pipeline">("relationship");
  const [newLinkLabel, setNewLinkLabel] = useState("");

  useEffect(() => {
    if (!data || !data.nodes.length || !svgRef.current || !containerRef.current) return;

    let width = containerRef.current.clientWidth;
    let height = containerRef.current.clientHeight;

    if (width === 0 || height === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    // Define colors and shapes based on entity type
    const getColor = (group: string) => {
      const g = (group || "").toLowerCase();
      if (g.includes('object') || g.includes('artifact') || g.includes('item')) return '#b45309'; // Amber
      if (g.includes('location') || g.includes('place') || g.includes('world')) return '#334155'; // Slate
      if (g.includes('faction') || g.includes('group') || g.includes('organization')) return '#0f172a'; // Dark Slate
      if (g.includes('archetype') || g.includes('concept')) return '#64748b'; // Light Slate
      return '#8B3A3A'; // Crimson for characters/default
    };

    const getSymbol = (group: string) => {
      const g = (group || "").toLowerCase();
      let type = d3.symbolCircle;
      if (g.includes('object') || g.includes('artifact') || g.includes('item')) type = d3.symbolDiamond;
      else if (g.includes('location') || g.includes('place') || g.includes('world')) type = d3.symbolSquare;
      else if (g.includes('faction') || g.includes('group') || g.includes('organization')) type = d3.symbolTriangle;
      else if (g.includes('archetype') || g.includes('concept')) type = d3.symbolStar;
      
      return d3.symbol().type(type).size(400)();
    };

    // Deep copy data to avoid mutating the original props
    const nodes = data.nodes.map(d => ({ ...d }));
    const links = data.links.map(d => ({ ...d }));

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(50));

    // Define arrow markers for pipeline links
    svg.append("defs").selectAll("marker")
      .data(["pipeline"])
      .join("marker")
      .attr("id", d => `arrow-${d}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25) // Offset to not overlap with node circle
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("fill", "#8B3A3A")
      .attr("d", "M0,-5L10,0L0,5");

    const g = svg.append("g");

    // Add zoom capabilities
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Draw links
    const link = g.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", d => d.type === "pipeline" ? "#8B3A3A" : "#94a3b8")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", d => d.type === "pipeline" ? 3 : 1.5)
      .attr("stroke-dasharray", d => d.type === "pipeline" ? "none" : "5,5")
      .attr("marker-end", d => d.type === "pipeline" ? "url(#arrow-pipeline)" : "");

    // Add link labels
    const linkLabel = g.append("g")
      .selectAll("text")
      .data(links)
      .join("text")
      .attr("font-size", "10px")
      .attr("fill", "#64748b")
      .attr("text-anchor", "middle")
      .attr("dy", -5)
      .text(d => d.label || "");

    // Draw nodes
    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
      )
      .on("click", (event, d) => {
        setSelectedNode(d as UniverseNode);
        setIsAddingLink(false);
        event.stopPropagation();
      });

    node.append("path")
      .attr("d", d => getSymbol(d.group))
      .attr("fill", d => getColor(d.group))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("class", "cursor-pointer transition-all hover:stroke-[#8B3A3A] hover:stroke-4");

    node.append("text")
      .attr("dy", 35)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "500")
      .attr("fill", "#1e293b")
      .text(d => d.name);

    // Background click to deselect
    svg.on("click", () => {
      setSelectedNode(null);
      setIsAddingLink(false);
    });

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      linkLabel
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2);

      node
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    const handleResize = () => {
      if (!containerRef.current) return;
      width = containerRef.current.clientWidth;
      height = containerRef.current.clientHeight;
      simulation.force("center", d3.forceCenter(width / 2, height / 2));
      simulation.alpha(0.3).restart();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      simulation.stop();
      window.removeEventListener('resize', handleResize);
    };
  }, [data]);

  const handleSaveLink = () => {
    if (selectedNode && newLinkTarget && onAddLink) {
      onAddLink(selectedNode.id, newLinkTarget, newLinkType, newLinkLabel);
      setIsAddingLink(false);
      setNewLinkTarget("");
      setNewLinkLabel("");
      setNewLinkType("relationship");
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col md:flex-row" ref={containerRef}>
      <svg ref={svgRef} className="w-full h-full min-h-[400px] bg-slate-50 rounded-2xl border border-[#e5e4e2]" />
      
      {selectedNode && (
        <div className="absolute top-4 right-4 w-80 bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-[#e5e4e2] z-10 max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-serif font-medium text-lg text-slate-900">{selectedNode.name}</h3>
              <p className="text-xs font-medium text-[#8B3A3A] uppercase tracking-wider mt-1">{selectedNode.group}</p>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); setSelectedNode(null); setIsAddingLink(false); }}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          
          {selectedNode.description && (
            <p className="text-sm text-slate-600 mt-3 leading-relaxed">{selectedNode.description}</p>
          )}

          {isAddingLink ? (
            <div className="mt-5 space-y-4 border-t border-[#e5e4e2] pt-4">
              <h4 className="text-sm font-bold text-slate-800">Add New Link</h4>
              
              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Target Character</Label>
                <select 
                  value={newLinkTarget}
                  onChange={(e) => setNewLinkTarget(e.target.value)}
                  className="w-full h-9 rounded-md border border-[#e5e4e2] bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B3A3A]"
                >
                  <option value="" disabled>Select a character...</option>
                  {data.nodes.filter(n => n.id !== selectedNode.id).map(n => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Link Type</Label>
                <select 
                  value={newLinkType}
                  onChange={(e) => setNewLinkType(e.target.value as any)}
                  className="w-full h-9 rounded-md border border-[#e5e4e2] bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B3A3A]"
                >
                  <option value="relationship">Relationship</option>
                  <option value="pipeline">Pipeline</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-600">
                  Description {newLinkType === "relationship" && "(e.g., Siblings, Rivals)"}
                </Label>
                <Input 
                  value={newLinkLabel}
                  onChange={(e) => setNewLinkLabel(e.target.value)}
                  placeholder="Short description..."
                  className="h-9 text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="flex-1 h-8 text-xs"
                  onClick={() => setIsAddingLink(false)}
                >
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  className="flex-1 h-8 text-xs bg-[#8B3A3A] hover:bg-[#7a3333] text-white"
                  onClick={handleSaveLink}
                  disabled={!newLinkTarget}
                >
                  Save Link
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Relationships and Pipelines */}
              {(() => {
                const connectedLinks = data.links.filter(
                  l => {
                    const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
                    const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
                    return sourceId === selectedNode.id || targetId === selectedNode.id;
                  }
                );

                const pipelinesOut = connectedLinks.filter(l => l.type === 'pipeline' && (typeof l.source === 'object' ? (l.source as any).id : l.source) === selectedNode.id);
                const pipelinesIn = connectedLinks.filter(l => l.type === 'pipeline' && (typeof l.target === 'object' ? (l.target as any).id : l.target) === selectedNode.id);
                const relationships = connectedLinks.filter(l => l.type === 'relationship');

                const getNodeName = (id: string) => data.nodes.find(n => n.id === id)?.name || id;

                return (
                  <div className="mt-5 space-y-5">
                    {pipelinesIn.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 border-b border-[#e5e4e2] pb-1">Originated From</h4>
                        <ul className="space-y-2">
                          {pipelinesIn.map((l, i) => {
                            const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
                            return (
                              <li key={i} className="text-sm">
                                <span className="font-medium text-slate-700">{getNodeName(sourceId)}</span>
                                {l.label && <span className="text-slate-500 block text-xs mt-0.5">{l.label}</span>}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {pipelinesOut.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 border-b border-[#e5e4e2] pb-1">Pipeline To</h4>
                        <ul className="space-y-2">
                          {pipelinesOut.map((l, i) => {
                            const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
                            return (
                              <li key={i} className="text-sm">
                                <span className="font-medium text-slate-700">{getNodeName(targetId)}</span>
                                {l.label && <span className="text-slate-500 block text-xs mt-0.5">{l.label}</span>}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {relationships.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 border-b border-[#e5e4e2] pb-1">Relationships</h4>
                        <ul className="space-y-2">
                          {relationships.map((l, i) => {
                            const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
                            const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
                            const otherId = sourceId === selectedNode.id ? targetId : sourceId;
                            return (
                              <li key={i} className="text-sm">
                                <span className="font-medium text-slate-700">{getNodeName(otherId)}</span>
                                {l.label && <span className="text-slate-500 block text-xs mt-0.5">{l.label}</span>}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {onAddLink && (
                      <div className="pt-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full h-8 text-xs border-dashed border-slate-300 text-slate-600 hover:text-[#8B3A3A] hover:border-[#8B3A3A] hover:bg-[#8B3A3A]/5"
                          onClick={() => setIsAddingLink(true)}
                        >
                          + Add Link
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-xl shadow-sm border border-[#e5e4e2] z-10 text-xs flex gap-6">
        <div>
          <div className="font-bold text-slate-800 mb-2 uppercase tracking-wider text-[10px]">Links</div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-0.5 bg-[#8B3A3A]"></div>
            <span className="text-slate-600">Pipeline Progression</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0 border-t border-dashed border-slate-400"></div>
            <span className="text-slate-600">Relationship</span>
          </div>
        </div>
        <div>
          <div className="font-bold text-slate-800 mb-2 uppercase tracking-wider text-[10px]">Entities</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#8B3A3A]"></div>
              <span className="text-slate-600">Character</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rotate-45 bg-[#b45309]"></div>
              <span className="text-slate-600">Object</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#334155]"></div>
              <span className="text-slate-600">Location</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10.4px] border-l-transparent border-r-transparent border-b-[#0f172a]"></div>
              <span className="text-slate-600">Faction</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#64748b"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <span className="text-slate-600">Archetype</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
