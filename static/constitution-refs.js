const constitutionTerms = {
    'role': {
        article: '1.1',
        definition: 'An organizational building block with a defined purpose, domains, and accountabilities.',
        context: 'Roles are filled by Partners, not owned by them.'
    },
    'domain': {
        article: '1.1.2',
        definition: 'An asset, process, or resource that a Role has exclusive authority to control.',
        example: 'Security policies, compute allocation decisions, fermentation protocols'
    },
    'accountability': {
        article: '1.1.3',
        definition: 'An ongoing activity a Role performs for the organization.',
        example: 'Monitoring incidents, coordinating responses, tracking metrics'
    },
    'tension': {
        article: '1.1',
        definition: 'The gap between current reality and a potential you sense.',
        context: 'Not a problem—an opportunity to explore improvement.'
    },
    'policy': {
        article: '2.1.3',
        definition: 'A grant or constraint of authority applying across a Circle\'s Roles.',
        example: 'Approval thresholds, process requirements, resource constraints'
    },
    'circle': {
        article: '2.1',
        definition: 'A Role that contains other Roles to organize work.',
        context: 'Circles delegate authority through roles within them.'
    },
    'objection': {
        article: '3.2.5',
        definition: 'A reason why a proposal would cause harm or move the organization backwards.',
        context: 'Valid objections must show harm/regression, not just different preferences.'
    }
};

// Auto-enhance terms wrapped in special spans
function enhanceConstitutionalTerms() {
    document.querySelectorAll('[data-const-term]').forEach(el => {
        const term = el.dataset.constTerm;
        const ref = constitutionTerms[term];
        
        if (ref) {
            el.style.cursor = 'help';
            el.style.borderBottom = '1px dotted #1976d2';
            el.title = `Article ${ref.article}: ${ref.definition}`;
            
            // Optional: Add click handler for more detail
            el.onclick = () => showTermDetail(term);
        }
    });
}

function showTermDetail(term) {
    const ref = constitutionTerms[term];
    if (!ref) return;
    
    alert(`${term.toUpperCase()} (Article ${ref.article})

${ref.definition}

${ref.example ? `Example: ${ref.example}` : ''}
${ref.context ? `\n${ref.context}` : ''}`);
}

// Run on page load
document.addEventListener('DOMContentLoaded', enhanceConstitutionalTerms);