import React from "react";

export default function Settings() {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Settings</h2>

      <p className="text-gray-700">
        Settings will include new options soon — such as system preferences,
        notifications, user roles, and advanced FleetPro configurations.
      </p>

      <div className="mt-6 border-t pt-4 text-sm text-gray-500">
        🚧 No settings available yet. Driver, Vehicle, Loading Point, and Dropoff
        management have their own menus now.
      </div>
    </div>
  );
}
