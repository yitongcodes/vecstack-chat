'use client';

import type { ContentBlock } from '@vecstack/shared';

interface Props {
  who: string;
  isAgent: boolean;
  content: ContentBlock[];
}

export function MessageBubble({ who, isAgent, content }: Props) {
  return (
    <div className={`bubble ${isAgent ? 'agent' : ''}`}>
      <div className="who">{who}</div>
      <div className="body">
        {content.map((block, i) => (
          <ContentBlockView key={i} block={block} />
        ))}
      </div>
    </div>
  );
}

function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'text':
      return <div>{block.text}</div>;
    case 'image':
      if (block.source.type === 'url') {
        return <img src={block.source.url} alt="" />;
      }
      return (
        <img
          src={`data:${block.source.media_type};base64,${block.source.data}`}
          alt=""
        />
      );
    case 'tool_use':
      return (
        <div style={{ fontSize: 12, color: '#6f6f68', fontStyle: 'italic' }}>
          calling <code>{block.name}</code>…
        </div>
      );
    case 'tool_result': {
      const text =
        typeof block.content === 'string'
          ? block.content
          : block.content.map((b) => (b.type === 'text' ? b.text : '')).join(' ');
      return (
        <div style={{ fontSize: 13, color: block.is_error ? '#c0392b' : '#444' }}>
          ↳ {text}
        </div>
      );
    }
    default:
      return null;
  }
}
