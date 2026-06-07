import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PythonRunner.css';

function PythonRunner({ assignmentId }) {
  const [pyodide, setPyodide] = useState(null);
  const [code, setCode] = useState('print("Hello, Python!")\n\nfor i in range(3):\n    print(f"カウント: {i}")');
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [submitMessage, setSubmitMessage] = useState('');
  const [hintCount, setHintCount] = useState(0);
  const hints = [
    "まずは変数に値を代入してみましょう。（例: a = 10, b = 20）",
    "次に、計算式を使って合計を求めましょう。（例: total = a + b）",
    "最後に、print()関数を使って結果を画面に出力しましょう。（例: print(total)）"
  ];

  useEffect(() => {
    const loadPyodideEnvironment = async () => {
      try {
        // Pyodideのスクリプトを読み込む
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
        script.async = true;
        document.body.appendChild(script);

        script.onload = async () => {
          // Pyodideの初期化
          const pyodideInstance = await window.loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
          });
          
          // print文の出力（標準出力）を画面のoutputに流し込む設定
          pyodideInstance.setStdout({ batched: (text) => {
            setOutput((prev) => prev + text + '\n');
          }});

          setPyodide(pyodideInstance);
          setIsLoading(false);
        };
      } catch (error) {
        console.error('Pyodideの読み込みに失敗しました', error);
        setOutput('Python環境の初期化に失敗しました。');
        setIsLoading(false);
      }
    };

    loadPyodideEnvironment();
  }, []);

  // よくあるPythonエラーの日本語翻訳・補助メッセージ
  const translateError = (errorString) => {
    if (errorString.includes("SyntaxError")) {
      return "💡 【文法エラー】構文が間違っています。コロン「:」の抜けや、クォーテーション「\"」の忘れ、カッコ「()」の閉じ忘れがないか確認してください。";
    }
    if (errorString.includes("IndentationError")) {
      return "💡 【インデントエラー】字下げ（インデント）が間違っています。行頭のスペースの数が揃っているか確認してください。";
    }
    if (errorString.includes("NameError")) {
      return "💡 【名前エラー】定義されていない変数や関数が使われています。スペルミスがないか、変数を作る前に使っていないか確認してください。";
    }
    if (errorString.includes("TypeError")) {
      return "💡 【型エラー】データ型の扱いが間違っています。例えば、文字と数値をそのまま足そうとしていないか確認してください。";
    }
    if (errorString.includes("ZeroDivisionError")) {
      return "💡 【ゼロ除算エラー】計算式の中で0で割り算をしようとしています。";
    }
    return "💡 エラーが発生しました。コードの内容をもう一度見直してみましょう。";
  };

  const runCode = async () => {
    if (!pyodide) return;
    setOutput(''); // 実行のたびに出力をリセット
    try {
      await pyodide.runPythonAsync(code);
    } catch (error) {
      const errorMsg = error.toString();
      const hint = translateError(errorMsg);
      setOutput((prev) => prev + errorMsg + '\n\n' + hint + '\n'); // エラーと日本語ヒントを両方表示
    }
  };

  const submitCode = async () => {
    setSubmitMessage('');
    const token = localStorage.getItem('token');
    if (!token) {
      setSubmitMessage('エラー：ログインしていません。');
      return;
    }
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      await axios.post(`${apiUrl}/progresses`, {
        assignment_id: assignmentId,
        saved_code: code + "\n\n# 実行結果:\n" + output,
        status: "提出済"
      }, { headers: { Authorization: `Bearer ${token}` } });
      setSubmitMessage('✅ 課題を提出しました！');
    } catch (error) {
      setSubmitMessage('❌ 提出に失敗しました。');
    }
  };

  const showHint = () => {
    if (hintCount < hints.length) {
      setHintCount((prev) => prev + 1);
      // TODO: 将来的にはここでバックエンドにヒント閲覧ログ（API）を送信し、教員が把握できるようにします
      // axios.put(`${apiUrl}/progress/hint`, ...);
    }
  };

  return (
    <div className="python-runner-container">
      <h3 className="runner-title">🐍 Python 実行環境</h3>
      {isLoading ? (
        <div className="loading-state">Python環境を準備中です...（初回は数秒〜十数秒かかります）</div>
      ) : (
        <div className="editor-layout">
          <div className="editor-section">
            <label>コードエディタ</label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="code-textarea"
              spellCheck="false"
            />
          </div>
          <div className="action-bar">
            <button onClick={runCode} className="btn-run">
              ▶ 実行する
            </button>
            <button onClick={submitCode} className="btn-submit">
              📤 教員に提出する
            </button>
            <button onClick={showHint} disabled={hintCount >= hints.length} className="btn-hint">
              💡 ヒントを見る ({hintCount}/{hints.length})
            </button>
            {submitMessage && (
              <span className={`submit-msg ${submitMessage.includes('✅') ? 'success' : 'error'}`}>
                {submitMessage}
              </span>
            )}
          </div>
          {hintCount > 0 && (
            <div className="hint-box">
              <strong>段階的ヒント:</strong>
              <ul>
                {hints.slice(0, hintCount).map((hint, index) => (
                  <li key={index}>{hint}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="console-section">
            <label>実行結果 (コンソール)</label>
            <pre className="console-output">
              {output}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default PythonRunner;