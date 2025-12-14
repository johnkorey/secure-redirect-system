import React from 'react';
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function StatsCard({ title, value, subtitle, icon: Icon, trend, color = "emerald" }) {
  const colorClasses = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-50 text-blue-600"
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="p-6 border-slate-200 hover:shadow-lg transition-all duration-300">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">
              {title}
            </p>
            <p className="text-4xl font-bold text-slate-900 mb-1">
              {value}
            </p>
            {subtitle && (
              <p className="text-sm text-slate-500 mt-2">{subtitle}</p>
            )}
            {trend && (
              <p className="text-xs text-emerald-600 font-medium mt-2">
                {trend}
              </p>
            )}
          </div>
          <div className={`p-4 rounded-2xl ${colorClasses[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}