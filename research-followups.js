// Follow-up prompts submit through the same composer and keep the conversation context.
const node = (tag, text, cls) => { const element = document.createElement(tag); if (text) element.textContent = text; if (cls) element.className = cls; return element; };
export function addResearchFollowups(result, { busy = () => false, mode = 'search' } = {}) {
  const q = selector => document.querySelector(selector);
  const related = node('section', null, 'research-followups');
  const italian = (window.GG_LANGUAGE?.wiki || 'it') === 'it';
  related.setAttribute('aria-label', italian ? 'Domande successive' : 'Follow-up questions');
  related.append(node('h4', italian ? 'Approfondisci' : 'Explore further'));
  const suggestions = italian
    ? ['Puoi spiegarlo in modo più semplice?', 'Quali sono i vantaggi e i limiti?', 'Puoi fare un esempio concreto?']
    : ['Can you explain this more simply?', 'What are the benefits and limitations?', 'Can you give a practical example?'];
  for (const question of suggestions) {
    const button = node('button', question); button.type = 'button';
    button.append(node('span', '↗'));
    button.onclick = () => {
      if (!result.isConnected || busy()) return;
      q('#creationmode').value = 'chat';
      q('#prompt').value = question;
      q('#chatform').requestSubmit();
    };
    related.append(button);
  }
  result.append(related);
}
