/*
 * The Receipts / Pulse score ring. respondent_n is REQUIRED and always shown:
 * a score from 40 respondents is not a score from 4,000 (TECHNICAL_PLAN §2).
 * Pass score = null to render an honest "not enough data yet" state.
 */
export default function ScoreRing({
  score,
  respondentN,
}: {
  score: number | null;
  respondentN: number;
}) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const offset = circ * (1 - pct);

  return (
    <div style={{ textAlign: "center" }}>
      <div className="score-ring">
        <svg viewBox="0 0 92 92" width="92" height="92">
          <circle className="score-ring__track" cx="46" cy="46" r={r} />
          {score != null && (
            <circle
              className="score-ring__value"
              cx="46"
              cy="46"
              r={r}
              strokeDasharray={circ}
              strokeDashoffset={offset}
            />
          )}
        </svg>
        <div className="score-ring__num">{score == null ? "—" : Math.round(score)}</div>
      </div>
      <div className="score-ring__n">
        {score == null ? "not enough responses yet" : `n = ${respondentN}`}
      </div>
    </div>
  );
}
