import { Composition, type CalculateMetadataFunction } from "remotion";
import { z } from "zod";
import { AgentCommunicationReplay, type AgentCommunicationReplayProps } from "./ReplayVideo";
import { buildReplayTimeline } from "./replayData";

export const agentCommunicationReplaySchema = z.object({
  title: z.string(),
  events: z.array(z.any())
});

const FPS = 30;
const SECONDS_PER_MESSAGE = 2.7;

const calculateMetadata: CalculateMetadataFunction<AgentCommunicationReplayProps> = ({ props }) => {
  const timeline = buildReplayTimeline(props.events);
  const durationInFrames = Math.max(8 * FPS, Math.ceil((2.8 + timeline.messages.length * SECONDS_PER_MESSAGE) * FPS));

  return {
    durationInFrames,
    props: {
      ...props,
      timeline
    }
  };
};

export const RemotionRoot = () => {
  return (
    <Composition
      calculateMetadata={calculateMetadata}
      component={AgentCommunicationReplay}
      defaultProps={
        {
          title: "多 Agent 协作沟通回放",
          events: [],
          timeline: {
            launchChapters: [],
            positioning: "DragonBoat is a crew coordination layer, not an agent wrapper.",
            runId: "run_unknown",
            messages: []
          }
        } satisfies AgentCommunicationReplayProps
      }
      durationInFrames={8 * FPS}
      fps={FPS}
      height={1080}
      id="AgentCommunicationReplay"
      schema={agentCommunicationReplaySchema}
      width={1920}
    />
  );
};
