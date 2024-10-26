import { useState, useEffect } from "react";

const ConfigForm = ({ onUpdate, widgetType }) => {
  const [goal, setGoal] = useState(1000);
  const [color, setColor] = useState("#6a00ff");

  useEffect(() => {
    function loadConfigFromLocalStorage() {
      const savedConfig = localStorage.getItem(`${widgetType}Config`);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        setGoal(parsedConfig.goal);
        setColor(parsedConfig.color);
      }
    }

    loadConfigFromLocalStorage();
  }, [widgetType]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onUpdate({ goal, color });
  };

  return (
    <form
      id="config-form"
      onSubmit={handleSubmit}
      className="flex flex-col items-center justify-center w-full p-4 mx-auto my-4 rounded-md shadow-md dark:bg-gray-800"
    >
      <div className="w-full mb-4">
        <label htmlFor="goal" className="block text-left mb-2 font-semibold">
          Goal Amount:
        </label>
        <input
          className="input input-bordered w-full max-w-xs p-2 rounded-md"
          type="number"
          id="goal"
          name="goal"
          min="0"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
      </div>

      <div className="w-full mb-4">
        <label htmlFor="color" className="block text-left mb-2 font-semibold">
          Color:
        </label>
        <input
          type="color"
          id="color"
          name="color"
          className="w-full max-w-xs h-10 rounded-md"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </div>

      <button className="btn btn-primary w-full max-w-xs" type="submit">
        Update
      </button>
    </form>
  );
};

export default ConfigForm;
