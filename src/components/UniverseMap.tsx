import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { UniverseData, UniverseNode, UniverseLink } from '../lib/api';

interface UniverseMapProps {
  data: UniverseData;
}

export default function UniverseMap({ data }: UniverseMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<UniverseNode | null>(null);

  useEffect(() => {
    if (!data || !data.nodes.length || !svgRef.current || !containerRef.current) return;

    let width = containerRef.current.clientWidth;
    let height = containerRef.current.clientHeight;

    if (width === 0 || height === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    // Create a color scale for groups
    const color = d3.scaleOrdinal(d3.schemeCategory10);

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
        event.stopPropagation();
      });

    node.append("circle")
      .attr("r", 20)
      .attr("fill", d => color(d.group))
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
    svg.on("click", () => setSelectedNode(null));

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

  return (
    <div className="relative w-full h-full flex flex-col md:flex-row" ref={containerRef}>
      <svg ref={svgRef} className="w-full h-full min-h-[400px] bg-slate-50 rounded-2xl border border-[#e5e4e2]" />
      
      {selectedNode && (
        <div className="absolute top-4 right-4 w-64 bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-[#e5e4e2] z-10">
          <h3 className="font-serif font-medium text-lg text-slate-900">{selectedNode.name}</h3>
          <p className="text-xs font-medium text-[#8B3A3A] uppercase tracking-wider mt-1">{selectedNode.group}</p>
          {selectedNode.description && (
            <p className="text-sm text-slate-600 mt-3 leading-relaxed">{selectedNode.description}</p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-xl shadow-sm border border-[#e5e4e2] z-10 text-xs">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-0.5 bg-[#8B3A3A]"></div>
          <span className="text-slate-600">Pipeline Progression</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0 border-t border-dashed border-slate-400"></div>
          <span className="text-slate-600">Relationship / Shared Universe</span>
        </div>
      </div>
    </div>
  );
}
