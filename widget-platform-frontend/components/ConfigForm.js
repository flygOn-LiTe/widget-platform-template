import { useState, useEffect } from "react";

const ConfigForm = ({ onUpdate }) => {
  const [goal, setGoal] = useState(1000);
  const [color, setColor] = useState("#6a00ff");

  useEffect(() => {
    function loadConfigFromLocalStorage() {
      const savedConfig = localStorage.getItem("config");
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        setGoal(parsedConfig.goal);
        setColor(parsedConfig.color);
      }
    }

    loadConfigFromLocalStorage();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    onUpdate({ goal, color });
  };

  return (
    <form
      id="config-form"
      onSubmit={handleSubmit}
      className="flex flex-col items-center justify-center w-full max-w-sm p-4 mx-auto my-4 rounded-md shadow-md dark:bg-gray-800"
    >
      <label htmlFor="goal">Goal:</label>
      <input
        className="input input-bordered"
        type="number"
        id="goal"
        name="goal"
        min="0"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
      />

      <label htmlFor="color">Color:</label>
      <input
        type="color"
        id="color"
        name="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
      />

      <button className="btn" type="submit">
        Update
      </button>
    </form>
  );
};

export default ConfigForm;
