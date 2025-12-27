import React from 'react';
import IPRangesConfig from '../components/configuration/IPRangesConfig';
import ISPConfigComponent from '../components/configuration/ISPConfigComponent';
import UserAgentConfig from '../components/configuration/UserAgentConfig';
import SystemSettings from '../components/configuration/SystemSettings';
import DomainManager from '../components/configuration/DomainManager';
import MailgunManager from '../components/configuration/MailgunManager';
import IPCacheManager from '../components/configuration/IPCacheManager';

export default function Configuration() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Configuration</h1>
        <p className="text-slate-500">Manage system settings and detection rules</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <SystemSettings />
        <IPCacheManager />
        <DomainManager />
        <MailgunManager />
        <IPRangesConfig />
        <ISPConfigComponent />
        <UserAgentConfig />
      </div>
    </div>
  );
}