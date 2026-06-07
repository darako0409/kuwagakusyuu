import React, { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import { useNavigate } from 'react-router-dom';

// インデントを解析し、JIS規格ベースのフローチャート（Mermaid）を生成する高度な変換関数
const convertPythonToMermaid = (code) => {
  if (!code || code.trim() === '') {
    return "graph TD\n  Start([開始]) --> End([終了])";
  }

  let mermaidCode = "graph TD\n  Start([開始])\n";
  // 空行やコメント行を除外してパース
  const lines = code.split('\n').filter(line => line.trim() !== '' && !line.trim().startsWith('#'));

  const nodes = [];
  // 1. 各行のインデントと種類（分岐、ループ、入出力、処理）を判定
  lines.forEach((line, index) => {
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const trimmedLine = line.trim();
    
    let type = 'process';
    let label = trimmedLine.replace(/["\\]/g, "'"); // 構文エラー回避のためクォートのみ置換、括弧は保持
    let shape = `["${label}"]`; // 角括弧: 処理

    if (/^(if|elif|while|for)\b/.test(trimmedLine)) {
      type = trimmedLine.match(/^(if|elif|while|for)\b/)[0];
      label = label.replace(/^(if|elif|while|for)\s+/, '').replace(/:$/, '');
      
      // 情報Ⅰの推奨表記: for文の条件を抽象化
      if (type === 'for') {
        label = '未処理のデータはあるか？';
      }

      shape = `{"${label}"}`; // ひし形: 条件分岐・ループ
    } else if (trimmedLine.startsWith('else:')) {
      type = 'else';
    } else if (trimmedLine.includes('print') || trimmedLine.includes('input')) {
      type = 'io';
      shape = `[/"${label}"/]`; // 平行四辺形: 入出力
    }

    nodes.push({ id: `N${index}`, text: trimmedLine, type, indent, shape, label });
  });

  // ターゲットIDを取得する補助関数（ループの場合は直前の合流点を返す）
  const getTargetId = (targetNode) => {
    if (!targetNode) return 'End';
    return ['while', 'for'].includes(targetNode.type) ? `${targetNode.id}_pre` : targetNode.id;
  };

  if (nodes.length > 0) {
    mermaidCode += `  Start --> ${getTargetId(nodes[0])}\n`;
  }

  // 2. ノードの図形定義を出力
  nodes.forEach(node => {
    if (['while', 'for'].includes(node.type)) {
      // ループへ戻る矢印をひし形の「上」に合流させるためのダミーノード（小さな丸）を配置
      mermaidCode += `  ${node.id}_pre((" ")) --> ${node.id}${node.shape}\n`;
    } else if (node.type !== 'else') {
      mermaidCode += `  ${node.id}${node.shape}\n`;
    }
  });

  mermaidCode += `  End([終了])\n`;

  // ブロックを抜けた後の「正しい合流先（または戻るべき親ループ）」を探す強力な補助関数
  const resolveNextNode = (startIndex, startIndent, current_i) => {
    let nextNode = null;
    let skipIndent = -1;

    for (let j = startIndex; j < nodes.length; j++) {
      // elseやelifのブロック内は論理的にスキップする
      if (skipIndent !== -1) {
        if (nodes[j].indent > skipIndent) {
          continue;
        } else {
          skipIndent = -1;
        }
      }

      if (nodes[j].indent <= startIndent) {
        if (nodes[j].type === 'else' || nodes[j].type === 'elif') {
           skipIndent = nodes[j].indent;
           continue;
        }
        nextNode = nodes[j];
        break;
      }
    }

    let exitToIndent = nextNode ? nextNode.indent : -1;
    
    // インデントが浅くなる（ブロックを抜ける）場合、親ループに戻るべきか判定
    if (exitToIndent < startIndent) {
      let loopNode = null;
      let currentLevel = startIndent;
      // 自身を囲む最も内側のループ（for, while）を探す
      for (let k = current_i; k >= 0; k--) {
        if (nodes[k].indent < currentLevel) {
          currentLevel = nodes[k].indent;
          if (['while', 'for'].includes(nodes[k].type)) {
            if (nodes[k].indent >= exitToIndent) {
              loopNode = nodes[k];
            }
            break;
          }
        }
      }
      if (loopNode) return loopNode;
    }
    return nextNode;
  };

  // 3. インデント構造に基づいて矢印（エッジ）を接続
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === 'else') continue;

    if (['if', 'elif'].includes(node.type)) {
      // Yesルート：ブロックの中身へ
      const yesNode = nodes[i + 1];
      if (yesNode && yesNode.indent > node.indent && yesNode.type !== 'else') {
        mermaidCode += `  ${node.id} -->|Yes| ${getTargetId(yesNode)}\n`;
      } else {
        mermaidCode += `  ${node.id} -->|Yes| End\n`;
      }
      // Noルート：次の条件（elif/else）またはブロック終了後の処理へ
      let noNode = null;
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[j].indent <= node.indent) {
          noNode = nodes[j];
          break;
        }
      }
      if (noNode) {
        if (noNode.type === 'elif') {
          mermaidCode += `  ${node.id} -->|No| ${getTargetId(noNode)}\n`;
        } else if (noNode.type === 'else') {
          const elseContent = nodes[nodes.indexOf(noNode) + 1];
          if (elseContent && elseContent.indent > noNode.indent) {
             mermaidCode += `  ${node.id} -->|No| ${getTargetId(elseContent)}\n`;
          } else {
             mermaidCode += `  ${node.id} -->|No| End\n`;
          }
        } else {
          const nextTarget = resolveNextNode(i + 1, node.indent, i);
          mermaidCode += `  ${node.id} -->|No| ${getTargetId(nextTarget)}\n`;
        }
      } else {
        const nextTarget = resolveNextNode(i + 1, node.indent, i);
        mermaidCode += `  ${node.id} -->|No| ${getTargetId(nextTarget)}\n`;
      }
    } else if (['while', 'for'].includes(node.type)) {
      // ループYes：中身へ
      const yesNode = nodes[i + 1];
      if (yesNode && yesNode.indent > node.indent) {
        mermaidCode += `  ${node.id} -->|Yes| ${getTargetId(yesNode)}\n`;
      } else {
        mermaidCode += `  ${node.id} -->|Yes| End\n`;
      }
      // ループNo：ループ終了後の処理へ
      const nextTarget = resolveNextNode(i + 1, node.indent, i);
      mermaidCode += `  ${node.id} -->|No| ${getTargetId(nextTarget)}\n`;
    } else {
      // 通常の処理・入出力からの遷移
      const nextTarget = resolveNextNode(i + 1, node.indent, i);
      mermaidCode += `  ${node.id} --> ${getTargetId(nextTarget)}\n`;
    }
  }

  return mermaidCode;
};

export default function PythonFlowchartEditor() {
  const [pythonCode, setPythonCode] = useState('');
  const [mermaidChart, setMermaidChart] = useState('graph TD\n  Start([開始]) --> End([終了])');
  const mermaidRef = useRef(null);
  const navigate = useNavigate();

  // Pythonコードの変更を検知してMermaidコードに変換（デバウンス処理付き）
  useEffect(() => {
    const timer = setTimeout(() => {
      const newChart = convertPythonToMermaid(pythonCode);
      setMermaidChart(newChart);
    }, 500); // タイピング中の頻繁な再描画を防ぐ
    return () => clearTimeout(timer);
  }, [pythonCode]);

  // Mermaidチャートの文字列が更新されたらSVGを描画する
  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
    const renderChart = async () => {
      if (mermaidRef.current && mermaidChart) {
        try {
          mermaidRef.current.innerHTML = '';
          // ユニークなIDを付与してMermaidをレンダリング
          const { svg } = await mermaid.render(`mermaid-svg-${Date.now()}`, mermaidChart);
          mermaidRef.current.innerHTML = svg;
        } catch (error) {
          console.error("Mermaidの描画エラー:", error);
        }
      }
    };
    renderChart();
  }, [mermaidChart]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px' }}>
      <div style={{ marginBottom: '15px' }}>
        <button onClick={() => navigate('/dashboard')} style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          ← ダッシュボードに戻る
        </button>
      </div>
      
      <div style={{ display: 'flex', gap: '20px', flex: 1 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <h3>Python Editor</h3>
          <textarea
            value={pythonCode}
            onChange={(e) => setPythonCode(e.target.value)}
            style={{ flex: 1, padding: '10px', fontFamily: 'monospace', fontSize: '14px' }}
            placeholder="ここにPythonコードを入力すると、右側にフローチャートが生成されます"
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <h3>Flowchart Preview</h3>
          <div
            ref={mermaidRef}
            style={{ flex: 1, border: '1px solid #ccc', padding: '10px', overflow: 'auto', backgroundColor: '#fff' }}
          />
        </div>
      </div>
    </div>
  );
}