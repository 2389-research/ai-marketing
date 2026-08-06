# We Built an AI Marketer. It Was Not as Smart as We Thought.

*Draft for 2389.ai/research/writing — byline: Aruzhan Zhengis*

*Products mentioned in this post: **Postique** — an AI marketing employee that researches, plans, writes, illustrates, and schedules a brand's social content, then learns from every rejection. A human approves everything before it ships.*

---

Postique is an AI marketing employee we built to run our own social presence. It researches what is happening in our space, picks topics, writes posts for each channel in that channel's format, matches photos from our library, generates short videos, runs everything through QA, and puts the results on a calendar. A human approves or rejects every piece, from the dashboard or from Slack. It does not auto-post, and that is a decision, not a missing feature.

On paper that sounds like a solved problem. You connect a strong model, you write good prompts, and you get a marketing team. What we actually got, for the first several weeks, was a system that was confident, fast, fluent, and frequently wrong in ways that took us a while to even notice. This post is a record of the four problems that cost us the most time and what ended up fixing each one. The short version of every fix is the same: we stopped trusting the model to follow instructions and started verifying its output with code.

## Problem 1: the research came back irrelevant

The research agent's job is to find what is worth posting about. Our first version asked the model to search trends and news and return interesting topics. It did exactly that, and the topics were interesting in general and useless for us. We got broad AI industry news, viral productivity content, and marketing advice that would fit any company on earth. Nothing about it was wrong. It just was not ours, and a topic that could belong to anyone produces a post that sounds like everyone.

The uncomfortable observation was that the model had no incentive to be relevant. Relevance was mentioned in the prompt, and the prompt was not enough, because "relevant" was doing all the work and the model filled it with its own generic idea of relevance.

What fixed it, in order of impact:

1. We made the brand context heavy and mandatory. Every research call now carries the company profile, the strategy document, the list of what has already been published, and a plain statement of what the company actually sells. Relevance stopped being an adjective and became material the model had to work against.
2. We made the agent score every candidate and defend the score in writing. A topic now arrives with a stated reason it fits this specific brand. Bad reasons are easy for a human to spot in a way that bad topics are not, and the reasons made rejections faster and more consistent.
3. We gave founder input priority over the feed. Ideas we type into the system outrank anything scraped from the internet, because the best topics were never going to come from trend monitoring.
4. We cut the frequency, because daily research produced mostly duplicates of what it found the day before, at real API cost. Research now runs only on days when content generation is actually due, and competitor monitoring runs weekly. Quality went up when volume went down, which was not the direction we expected.


There is also an honest infrastructure note here: scraping the modern web barely works. Half the sites we wanted return bot-check pages to a server. Where we cannot fetch, the system now says so and asks the human to paste the content in, which is less impressive than pretending and much more useful.

## Problem 2: the model looked smart and failed at simple things

The failures that hurt were not the exotic ones. They were basic reasoning mistakes hidden under fluent output, and the fluency is what made them hard to catch.

Here is one example. The system tracks how mature a brand's presence is, so a brand with no published history gets introduction posts before it gets opinion posts. Our counter treated one topic adapted into eight channel versions as eight pieces of content history. The brand had published one thing, and the system concluded it was an established account and skipped the introductions entirely. The model never noticed, because nothing in generation forced it to notice. We found it by reading output and asking why the plan felt wrong.

Here is another. The strategist kept proposing topics we had already covered, phrased differently enough to pass a string comparison. It had the published history right there in context, and having information turns out to be different from using it. We ended up adding a semantic deduplication pass in code that compares new topics against everything posted before, and we made the strategist propose more topics than needed so the pipeline can discard duplicates without shrinking the batch.

The third example is QA itself. Rules that lived in prompts were followed most of the time, and most of the time is a uselessly weak guarantee when you generate every day. Any rule we actually cared about had to move into deterministic code that blocks the draft, with the model's role reduced to fixing what the code flagged.

The general finding, and we mean this as a real research takeaway rather than a complaint: a language model's competence is not uniform. It writes like a senior and counts like a toddler, and the writing quality actively hides the counting mistakes. Every load-bearing decision in the pipeline eventually got a code-level check behind it. The model proposes, the code verifies, the human decides.

## Problem 3: the language was the hardest part

We assumed writing would be the easy half, since writing is the one thing everyone agrees these models can do. It turned out to be the longest fight in the project, because the models write fluently in a voice nobody wants: the recognizable AI voice.

The symptoms are familiar to anyone who reads LLM output: em dashes on every line, words like "delve" and "game-changer", the construction "it's not just X, it's Y", and the one that finally made us angry, the staccato cadence, where every idea gets chopped into dramatic fragments. Our system produced a post containing the line "Your flow state is gone. Not annoyed gone. Rebuild-context-for-twenty-minutes gone." and that was the day this became a project priority.

Our first fix attempt was better prompting, with a style guide in the system prompt. It helped a little and failed reliably. The model would follow the guide for a batch and then drift back. We accepted that style instructions are preferences, and preferences lose to training data.

The fix that held has three layers:

1. A deterministic linter, no LLM involved, that runs on every draft. It has a banned word list, regex patterns for the known constructions, and a rhythm check that counts words per sentence and fails a draft with three consecutive ultra-short sentences or a majority of sentences under six words. A violation blocks the draft.
2. A self-correction pass. When the linter fails a draft, the writer gets the exact violations back and rewrites once before a human ever sees it. Most drafts arrive clean now.
3. Real voice data. We pasted our actual posts, written by humans, into the brand profile as examples, and the instruction is to match their rhythm and casualness rather than any description of a voice. Examples turned out to carry more information than any adjective list we wrote.

While debugging this we found the most instructive bug of the project. Our own prompt said to mix short, medium, and long sentences, and included a punchy example. The model read that as a reward for fragments. We were prompting the exact behavior we were fighting. The prompt now says to write complete sentences with at most one fragment per post, and a good part of the problem disappeared before the linter even runs.

There is a longer-term layer on top of this. Every rejection with a reason, every manual edit, and every "here is what I actually posted" paste gets stored as an event, and a nightly job distills those events into a short lessons memo that rides into every future prompt. It is not machine learning. It is a diary the agent has to reread every morning, and it means a correction we make once tends to stay made.

## Problem 4: the videos rendered badly

Postique makes videos without a video model. The model writes a real motion graphics program for each brief, and a renderer turns the code into an MP4. This is genuinely a good architecture, and for weeks the output was still disappointing. Every video looked like the same template: a headline sliding over a gradient, in different colors.

We found three separate causes, and all three were ours.

The first was a token budget. We had capped the code generation at a size that could only hold a one-scene composition, so every video was structurally identical no matter what the prompt asked for. Tripling the budget immediately produced multi-scene videos. We had been blaming the model's creativity for what was actually our own limit.

The second was the brief. Our briefs said things like "energetic, modern, punchy", and the output was exactly as vague as the input. We rebuilt the brief as a shot specification: exact duration, a color palette where each hex value has a stated meaning, a timecoded shot list where no shot runs longer than four seconds, a named transition at every cut, and a list of banned clichés like particle backgrounds and floating 3D shapes. Specifying with numbers instead of adjectives changed the output more than any model upgrade we tried. We also let the videos build interface chrome, terminal windows and inbox rows and notification cards, because rendered UI comes out crisp when it is real code, and text sitting inside a plausible interface reads far better than text floating on a background.

The third was arithmetic again. Scene transitions in the renderer share frames with the scenes on both sides, the model kept getting the sums wrong, and the result was scenes that ended before their content finished animating. The fix was making the generated code start with a frame map, a comment listing every scene's frame range and every overlap, with a total that has to add up to the declared duration. Making the model show its arithmetic caught the errors that asking it to be careful never caught.

## What we take from this

Four findings, stated as plainly as we can:

1. Instructions in prompts are suggestions. Anything that must be true needs a check in code, and the model's job shifts to fixing what the check catches.
2. Fluency hides errors. The better the output reads, the longer a reasoning mistake survives, so someone has to actually read the output the way a reviewer reads code.
3. Examples beat descriptions. Real posts taught voice better than every style adjective we wrote, and reference specs taught video direction better than mood words.
4. Feedback is data. Storing every rejection and edit, and distilling them nightly into lessons the agent must reread, made the system cheaper to supervise every week, and supervision cost is the real metric for an AI employee.

Postique runs our channels today, and a human still approves every post. We think that is the right shape for now. The models are impressive, and impressive is not the same as reliable, and the distance between those two words is where all the engineering went.

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
