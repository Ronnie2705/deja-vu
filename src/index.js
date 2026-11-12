import api from '@forge/api';

export function messageLogger(payload){
  console.log(`Logging message: ${payload.message}`);
}

export const graphEcho = async () => {
  const res = await api.asUser().requestTeamworkGraph(
    `query dejavu_echo { echo(myString: "Hello from Deja Vu") }`
  );
  const body = await res.json();
  console.log('TWG echo:', JSON.stringify(body));
  return JSON.stringify(body);
};
