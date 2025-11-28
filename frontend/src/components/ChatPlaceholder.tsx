import React from 'react';

/**
 * Minimal chat UI shell that mirrors the action card layout while the chatFlow agent
 * only echoes intended SQLite queries against the `item` schema (no tools executed yet).
 */
const ChatPlaceholder: React.FC = () => {
  // TODO(chat-ui): Wire chat history persistence + tool invocation previews once chatFlow connectors, SQLite-tool wiring, and store are ready per docs/chat-agent-plan.md.
  return (
    <div className="card">
      <h3>Chat (MVP)</h3>
      <p className="muted">
        The chatFlow agent currently runs in echo-only mode and will show the SQLite queries it plans to issue for the
        `item` schema before persistence and tool integration land.
      </p>
    </div>
  );
};

export default ChatPlaceholder;
