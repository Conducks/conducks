import React from 'react';

export interface PanelProps {
  title: string;
  open: boolean;
}

export type Tone = 'warn' | 'ok';

export const DEFAULT_TONE: Tone = 'ok';

export class Panel extends React.Component<PanelProps> {
  render() {
    return <section className="panel">{this.props.title}</section>;
  }
}

export function Badge({ title }: PanelProps) {
  return <span>{title}</span>;
}

export const Toolbar = ({ open }: PanelProps) => (
  <div>{open ? <Badge title="on" open /> : null}</div>
);

export enum Slot {
  Head = 'head',
  Foot = 'foot',
}
