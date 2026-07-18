export function ReaderActions(props: {
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  onFinish: () => void;
  primaryDisabled?: boolean;
  secondaryDisabled?: boolean;
  helperText?: string;
}) {
  return (
    <nav className="reader-actions" aria-label="共读操作">
      {props.helperText ? (
        <p className="reader-action-hint">{props.helperText}</p>
      ) : null}
      <button className="action-primary" onClick={props.onPrimary} disabled={props.primaryDisabled}>{props.primaryLabel}</button>
      <button onClick={props.onSecondary} disabled={props.secondaryDisabled}>{props.secondaryLabel}</button>
      <button onClick={props.onFinish}>今天看到这里</button>
    </nav>
  );
}
