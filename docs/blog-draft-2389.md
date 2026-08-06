# I Built an AI Marketing Employee. Here Is What Nobody Tells You.

*Draft for 2389.ai/research/writing — byline: Aruzhan Zhengis*

*Products mentioned in this post: **Postique** — an AI marketing employee that researches, plans, writes, illustrates, and schedules a brand's social content, then learns from every rejection. A human approves everything before it ships.*

---

For the past month I have been building Postique, an AI employee that runs marketing for two of our brands. Not a chatbot that writes captions when you ask nicely. An actual employee with a schedule: it wakes up before me, reads its feedback diary, researches what is happening in our space, plans topics against our strategy, writes posts for every channel, makes the videos, runs its own QA, and puts everything on a calendar for me to approve.

People ask me the same questions about it every time it comes up, so I am going to answer them the way I would on a podcast, honestly, including the parts where the whole thing embarrassed me.

## So does it work?

Yes, and it took a month of fixing things I did not expect to be broken. The models are genuinely impressive. They are also unreliable in ways that fluent output hides really well, and the story of this project is basically the story of finding those spots one by one.

Here is where it stands today, with real numbers. Since July 21 the system has generated 123 drafts across two brands. We have posted 26 of them so far, spread across X, Threads, Instagram, TikTok, and YouTube Shorts. I rejected 20, I edited a bunch before posting, and everything I rejected or edited got recorded, because the system learns from that (more on this later). It has made 19 videos. Every single post that went live was approved by a human first, and I will explain why that is a feature and not a limitation.

## What was the first thing that went wrong?

The research. The agent's job every morning is to find what is worth posting about, and the first version came back with content that was interesting and completely irrelevant. General AI news. Viral productivity advice. Topics that would fit any company on the planet, which means they fit ours in the most forgettable way possible.

Here is the thing I had to accept: I told the model to find "relevant" topics, and the model does not know what relevant means for us. It filled that word with the internet's average idea of relevance. Nothing in the setup forced it to care about our specific company, so it did not.

The fix was mostly about removing the model's room to be lazy. Every research run now carries the full brand context, the strategy, and everything we already published, so relevance is something it has to work against rather than imagine. Every topic it proposes comes with a score and a written reason why it fits this brand specifically, and bad reasons are much easier to catch than bad topics. My own ideas outrank anything from the feed, because honestly, the best topics were never coming from trend scraping. And I cut research from daily to only the days content is actually due, which saved money and, surprisingly, improved quality. Daily runs mostly rediscovered yesterday's findings.

Also, a confession about scraping: half the modern web just refuses to be scraped by a server. Bot checks everywhere. Where the system cannot fetch something, it now says so and asks me to paste the content in. Less magical, more honest, works better.

## You keep saying the models are smart. Are they?

They are, and this is the interesting part, the intelligence is not evenly distributed. The same model that writes a genuinely good LinkedIn post cannot reliably count.

My favorite example: the system tracks how mature a brand's social presence is, so that a brand new account gets introduction posts before it gets hot takes. At some point it decided one of our brand new accounts was well established. Why? It had adapted one single topic into eight channel versions, and counted that as eight pieces of published history. One post, counted eight times, conclusion: we are famous now, skip the introductions.

The model never flagged this. The plan it produced from the wrong premise read perfectly reasonably, and that is exactly the problem. The better the output reads, the longer a broken assumption survives underneath it. I only caught it by reading the plan and asking why it felt wrong for a brand that had published exactly once.

Same lesson kept repeating everywhere. The strategist proposed topics we had already covered, worded differently, while the published history sat right there in its context. QA rules written in prompts got followed "most of the time," which sounds fine until you generate content every day and "most" quietly becomes "not this time." Every one of these ended the same way: the rule moved out of the prompt and into code. A semantic duplicate check compares topics against everything ever posted. A deterministic linter blocks drafts. The maturity counter counts distinct topics now, in Python, where counting works.

If I had to compress this whole project into one sentence, it is this one: the model proposes, code verifies, a human decides.

## What was the hardest part? I would guess the videos.

Everyone guesses the videos. It was the writing.

Which is funny, right? Writing is the one thing everybody agrees these models can do. But they write in a voice, and you know the voice. The em dashes. The word "delve". The "it's not just X, it's Y" construction. And the one that finally broke me, the staccato thing, where every idea gets chopped into dramatic fragments. One day the system produced a post with the line "Your flow state is gone. Not annoyed gone. Rebuild-context-for-twenty-minutes gone." and I decided this was now the project's main problem, because our entire pitch is that AI can do real work, and every post was announcing a robot wrote it.

I tried better prompts first, obviously. A whole style guide in the system prompt. It helped for a batch or two and then the model drifted right back, and I have made peace with why: style instructions are preferences, and preferences lose to training data every time.

What actually held was treating style like a build check. There is now a linter, plain deterministic code, that runs on every draft. Banned words, banned constructions, and a rhythm check that literally counts words per sentence and fails a draft with three chopped sentences in a row. A failed draft goes back to the model with the exact violations, it gets one rewrite, and only clean drafts reach me. On top of that I pasted our real posts, written by actual humans, into the brand profile and told the model to match their rhythm instead of matching my adjectives. Examples turned out to teach voice better than any description of voice I ever wrote.

And the bug I will be telling people about for years: my own prompt was causing the staccato. It told the model to "mix short, medium, and long sentences" and included a punchy example, and the model read that as "fragments get rewarded." I was prompting the disease while prompting against the symptoms. Deleted the example, said "complete sentences, one fragment max," and half the problem vanished before the linter even runs.

## Okay but how do you make videos without a video model?

This is my favorite thing to explain. There is no video generation model anywhere in the system. When Postique needs a video, the model writes an actual motion graphics program, real React code with springs and easing curves, and a render server turns that code into an MP4. The server sleeps when idle and wakes up when there is work, so it costs nothing between renders.

For weeks the output was disappointing anyway, and all three causes turned out to be mine. I had set a token limit that only had room for a one-scene composition, so every video was structurally the same template and I was blaming the model's creativity for my own config value. My briefs said things like "energetic, modern, punchy," and the model returned videos exactly as vague as those words. And the scene transitions kept cutting content off early, because transitions share frames with the scenes on both sides and the model kept getting that arithmetic wrong.

The brief is now a shot spec instead of a mood: exact duration, a timecoded shot list, a named transition at every cut, a palette where every color has a stated job, and a banned list (no particle backgrounds, no floating 3D shapes, no confetti). The generated code has to open with a frame map, a comment where the model writes out every scene's frame range and proves the totals add up, which catches the arithmetic errors that "please be careful" never caught. And since the videos are code, they can render actual interface chrome, terminal windows and inbox rows with real-looking content, which instantly reads more like a product film and less like a template.

Same model the whole time. The difference was whether the director speaks in numbers or in adjectives.

## Why not let it post on its own?

Because I have read its output for a month. It is good, and it is good the way a talented new hire is good: fast, confident, and occasionally wrong in ways that would be public and embarrassing. Every platform also makes automated posting genuinely painful, with API reviews and revocable tokens, but honestly that is not the reason. The reason is that "agent publishes to your brand accounts unsupervised" is a product I do not want yet, from anyone.

So approval is the whole design. I review from a dashboard or straight from Slack, and rejecting takes one tap plus a reason chip: off-brand, boring, sounds like AI, wrong facts, bad topic. That reason does not vanish. Every rejection, every manual edit, every "here is what I actually posted instead" gets stored, and a job runs every morning at 5:45 that distills the new feedback into a short lessons memo the agent reads before doing anything else. It is not machine learning, there is no training run. It is closer to a diary the employee has to reread every morning, and it works: correct something once and it tends to stay corrected. The system is a few weeks old and the diary is short so far, but this is the part I am most convinced by, because it means supervision gets cheaper every week instead of staying constant.

## What did you actually learn?

Four things I did not fully believe before this project, and one bonus.

First, prompts are suggestions. Anything that must be true needs a check in code. The model's role then shifts from "follow the rules" to "fix what the check caught," and it is much better at the second job.

Second, fluency hides errors. You have to read agent output the way you review code, actively looking for what is wrong, because the agent will never tell you its own work is mediocre. Some of my worst bugs produced the most confident-sounding output.

Third, examples beat descriptions, everywhere. Real posts taught voice better than style adjectives. Reference specs taught video direction better than mood words. When output quality disappoints, the first question should be whether you showed the model what good looks like or just described it.

Fourth, feedback is data. A rejection with a reason is worth more than the draft it killed. Store it, distill it, feed it back.

The bonus: I built all of this with Claude writing most of the code, which means an AI wrote the linter that stops an AI from sounding like an AI. I have decided not to think about that too hard.

Postique runs our channels today, a human approves every post, and I check the feedback diary most mornings to see what it learned. That is the honest state of AI employees in 2026: not autopilot, but a genuinely fast colleague whose work you read carefully, and who, unlike some human colleagues, actually remembers what you told them yesterday.

---

## SUGGESTED ASSETS (not part of the post)

**Screenshots** (can be captured clean on request):
1. Dashboard calendar with a scheduled month and the day panel open
2. A draft's QA panel showing named rule violations, the linter being real
3. The reject flow with reason chips ("Sounds like AI"), the capture layer
4. Brand page "What the AI has learned" card with real lessons
5. Research page showing a scored topic with its written reason
6. Video studio showing the shot-spec prompt in the editable box

**Code/artifacts:**
7. The slop-pattern regex excerpt (echo endings, "Not X. Not Y.", rhythm counter)
8. A real frame-map comment from a generated composition (in storage at `source/<video>.tsx`)
9. The crontab block: learn 5:45, intel Monday, research gated, generate 8:00

**Video:**
10. Embed one rendered video, or a 6-frame contact sheet of it
11. Strongest single visual: before/after pair, an old one-scene gradient render next to a new shot-spec render with interface chrome
