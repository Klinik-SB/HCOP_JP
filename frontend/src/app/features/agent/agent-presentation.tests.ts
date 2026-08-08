import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentChartArtifact } from './agent.models';
import { agentAnswerBlocks, agentChartColor, buildAgentChartView } from './agent-presentation';

test('presenta párrafos y listas sin convertir contenido del LLM en HTML', () => {
  assert.deepEqual(agentAnswerBlocks('Resumen clínico\n\n- Primer hallazgo\n* Segundo hallazgo\n\nCierre'), [
    { kind: 'paragraph', text: 'Resumen clínico' },
    { kind: 'list', items: ['Primer hallazgo', 'Segundo hallazgo'] },
    { kind: 'paragraph', text: 'Cierre' }
  ]);
  assert.deepEqual(agentAnswerBlocks('<script>alert(1)</script>'), [
    { kind: 'paragraph', text: '<script>alert(1)</script>' }
  ]);
});

test('recupera ejes, grilla, etiquetas y valores negativos del gráfico histórico', () => {
  const chart: AgentChartArtifact = {
    type: 'chart', chartType: 'line', xLabel: 'Fecha',
    series: [{ name: 'Marcador', color: '#0e9aef', points: [
      { x: '2026-01-01', y: -2 }, { x: '2026-02-01', y: 8 }
    ] }]
  };
  const view = buildAgentChartView(chart);
  assert.equal(view?.kind, 'cartesian');
  if (!view || view.kind !== 'cartesian') return;
  assert.equal(view.width, 420);
  assert.equal(view.height, 230);
  assert.equal(view.yTicks.length, 5);
  assert.equal(view.xTicks.length, 2);
  assert.equal(view.xLabel, 'Fecha');
  assert.ok(view.series[0].points[0].y > view.baselineY, 'el valor negativo debe quedar debajo de cero');
  assert.ok(view.series[0].points[1].y < view.baselineY, 'el valor positivo debe quedar arriba de cero');
});

test('alinea categorías compartidas y agrupa barras de series distintas sin superponerlas', () => {
  const chart: AgentChartArtifact = {
    type: 'chart', chartType: 'bar',
    series: [
      { name: 'A', points: [{ x: 'Día 1', y: 4 }, { x: 'Día 8', y: 5 }] },
      { name: 'B', points: [{ x: 'Día 1', y: 2 }, { x: 'Día 8', y: 3 }] }
    ]
  };
  const view = buildAgentChartView(chart);
  assert.equal(view?.kind, 'cartesian');
  if (!view || view.kind !== 'cartesian') return;
  const first = view.series[0].points[0];
  const second = view.series[1].points[0];
  assert.equal(first.x, second.x, 'la misma categoría usa el mismo centro');
  assert.ok(first.bar && second.bar);
  assert.notEqual(first.bar?.x, second.bar?.x, 'cada serie ocupa una barra diferente');
  assert.ok((first.bar?.x || 0) + (first.bar?.width || 0) <= (second.bar?.x || 0));
});

test('dibuja correctamente un gráfico circular incluso con una única porción', () => {
  const chart: AgentChartArtifact = {
    type: 'chart', chartType: 'pie',
    series: [{ name: 'Respuesta', color: '#0e9aef', points: [{ x: 'Control', y: 100 }] }]
  };
  const view = buildAgentChartView(chart);
  assert.equal(view?.kind, 'pie');
  if (!view || view.kind !== 'pie') return;
  assert.equal(view.slices.length, 1);
  assert.match(view.slices[0].path, /A76 76 0 1 1/g);
  assert.match(view.slices[0].legend, /100%/);
});

test('rechaza colores CSS arbitrarios y conserva sólo hexadecimales seguros', () => {
  assert.equal(agentChartColor({ color: 'url(javascript:alert(1))', points: [] }, 0), '#0e9aef');
  assert.equal(agentChartColor({ color: '#3f9b86', points: [] }, 0), '#3f9b86');
});
