import { Calendar, Coffee, FileText, Inbox } from 'lucide-react';

export type TabType = 'today' | 'upcoming' | 'someday' | 'notes' | 'archive';

interface ViewTabsProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  counts: Record<TabType, number>;
}

export const ViewTabs: React.FC<ViewTabsProps> = ({ activeTab, setActiveTab, counts }) => {
  const tabsList = [
    {
      id: 'today' as TabType,
      label: 'Today',
      className: 'tab-today',
      icon: <span className="tab-icon">❦</span>,
    },
    {
      id: 'upcoming' as TabType,
      label: 'Upcoming',
      className: 'tab-upcoming',
      icon: <Calendar className="tab-icon" size={14} />,
    },
    {
      id: 'someday' as TabType,
      label: 'Someday',
      className: 'tab-someday',
      icon: <Coffee className="tab-icon" size={14} />,
    },
    {
      id: 'notes' as TabType,
      label: 'Notes',
      className: 'tab-notes',
      icon: <FileText className="tab-icon" size={14} />,
    },
    {
      id: 'archive' as TabType,
      label: 'Archive',
      className: 'tab-archive',
      icon: <Inbox className="tab-icon" size={14} />,
    },
  ];

  return (
    <nav className="horizontal-tab-nav" aria-label="Views">
      {tabsList.map((tab) => (
        <button
          key={tab.id}
          className={`${tab.className} ${activeTab === tab.id ? 'active-tab' : ''}`}
          onClick={() => setActiveTab(tab.id)}
          title={`${tab.label} (${counts[tab.id]})`}
        >
          {tab.icon}
          <span>
            {tab.label} {counts[tab.id] > 0 && `(${counts[tab.id]})`}
          </span>
        </button>
      ))}
    </nav>
  );
};
