# Meet Postique, Our AI Marketing Employee

*Draft for the 2389 website blog — byline: Aruzhan Zhengis*

*Products mentioned in this post: **Postique** — an AI marketing employee that researches, plans, writes, illustrates, and schedules a brand's social content, then learns from every rejection. A human approves everything before it ships.*

![Postique turns the mess into a calendar](blog-images/01-what-is-postique.png)

---

For the past month I have been building Postique, our AI marketing employee. Not a chatbot that writes a caption when you ask nicely. An employee with an actual morning routine: it wakes up before me, rereads its feedback diary, checks what is happening in our space, plans topics against our strategy, writes posts for every channel in that channel's native format, makes the videos, runs its own QA, and lays everything out on a calendar for me to approve.

It currently runs social for two of our brands, including the one whose blog you are reading right now. So yes, there is a decent chance an AI planned the post sitting next to this one.

## Why did we even need this?

Because marketing is the job everyone at a small company agrees is important and nobody actually does. The ideas live in someone's phone notes. The photos are scattered across four devices. Somebody posts three times in one week, feels great about it, and then the account goes quiet for a month. Consistency is the entire game on social, and consistency is exactly what busy humans are worst at.

An AI employee does not get bored, does not forget the strategy, and does not skip Tuesday because Tuesday was chaotic. The plan shows up whether you had a good week or not. That alone changed more than any single clever feature.

## Okay, but why not just use ChatGPT?

This is the question I get most, and it is a fair one, because the writing itself is not the hard part. Any good model can write a decent caption if you feed it the right context. The difference is everything around the writing.

![A chat window forgets, an employee remembers](blog-images/02-not-a-chatbot.png)

When you use a chat window, you are the pipeline. You bring the idea, you paste the brand voice, you ask for the post, you fix the tone, you find a photo, you pick a time, and next week you do all of it again from a blank page, because the chat forgot everything. The model is smart and the workflow has the memory of a goldfish.

Postique flips that. It knows what we already published, so it does not pitch the same topic twice. It knows which channels are active and writes natively for each one, because a LinkedIn post and a TikTok script have nothing in common. It knows our actual voice, not from adjectives I wrote, but from real posts by real humans on our team that it studies as examples. It knows the strategy, so a founder idea I type on Monday outranks whatever the internet is trending on Tuesday. And when I reject a draft, that click is not a dead end. It becomes data.

One honest note here: the model alone was not smart enough for any of this. Early Postique confidently decided a brand with exactly one published post was a well-established account, because it had adapted that one post into eight channel versions and counted them as eight pieces of history. Fluent writing, kindergarten math. Every important rule in the system eventually moved out of the prompts and into real code that checks the model's work. The model proposes, code verifies, a human decides.

## The fight against sounding like AI

My favorite war story. Early drafts were fine until you read them, and then you could smell it: the em dashes, the word "delve", and that staccato thing where every idea gets chopped. Into fragments. For drama. One day the system wrote "Your flow state is gone. Not annoyed gone. Rebuild-context-for-twenty-minutes gone." and I declared an emergency.

![The style gate bounces robotic drafts](blog-images/03-slop-gate.png)

Style guides in the prompt did not fix it. The model follows them for a batch and drifts right back, because polite instructions lose to training data. What fixed it was a linter, actual deterministic code that runs on every single draft: banned words, banned sentence constructions, and a rhythm check that literally counts words per sentence and fails a draft with three chopped fragments in a row. A failed draft goes back to the model with the exact violations and gets rewritten before I ever see it.

The plot twist: while debugging this I found that my own prompt was causing the staccato. It told the model to "mix short and long sentences" and included a punchy example, which the model read as an invitation. I was prompting the disease while prompting against the symptoms. So now an AI-written linter stops an AI from sounding like an AI, and I have decided not to think about that sentence too hard.

## It learns from every "no"

This is the part I am most proud of. Every rejection comes with a one-tap reason: off-brand, boring, sounds like AI, wrong facts, bad topic. Every manual edit gets stored as a diff. There is even a box for "here is what I actually posted instead", which is the purest feedback that exists.

![The 5:45am diary](blog-images/04-feedback-diary.png)

Then every morning at 5:45, before any content work starts, a job distills the new feedback into a short lessons memo, and the agent reads that memo before doing anything else. It is not machine learning and there is no training run. It is closer to a diary the employee has to reread every morning. Tell it once that hashtag walls look desperate, and the lesson sticks. The practical effect is the metric I care about most: the agent gets cheaper to supervise every week.

## The videos are secretly code

Postique makes short videos with no video model anywhere in the stack. When it needs one, the model writes an actual motion graphics program, real code with springs and easing curves, and a little render server wakes up, turns the code into an MP4, and goes back to sleep.

![Code goes in, a video comes out](blog-images/05-videos-are-code.png)

Getting them to look good was its own saga. My briefs said "energetic, modern, punchy" and the videos came out exactly as vague as those words. The fix was making the brief a proper shot spec: exact durations, a timecoded shot list, a named transition at every cut, a palette where every color has one job, and a ban list that includes floating 3D spheres and confetti. Directors who speak in numbers get better videos than directors who speak in adjectives. Turns out that is true for AI directors too.

## Other stuff I love

A quick tour of the corners that make it feel like a product and not a pipeline. There is an Idea Board that works like a wall of sticky notes: scribble a thought, pin it, drag it around, and when you open a note the AI has quietly developed it into angles and a hook, with buttons to turn it into a draft, a research topic, or a video. Next to your stickies you can pin inspiration clippings: drop a link or a screenshot of a post you loved, and the AI breaks down why it works and what pattern is worth stealing, with a hard rule to imitate the pattern and never the words. And the built-in assistant actually does things now: share a link and it reads it, ask about your photo library and it looks at the photos, give it a YouTube video and it watches the thing, frames and transcript, before giving you an opinion.

## So how is it going?

Real numbers, because this is still a research company. Since July 21: 123 drafts generated, 26 posted across X, Threads, Instagram, TikTok, and YouTube Shorts, 20 rejected by me, 19 videos rendered. Every single post was approved by a human first, and that is the design, not a temporary training wheel. I have read a month of this agent's output, and it is good the way a talented new hire is good: fast, confident, and occasionally wrong in ways that would be very public.

What I actually learned, in one breath: prompts are suggestions and code is law, fluent output hides dumb mistakes so you have to read it like a reviewer, examples teach voice better than descriptions ever will, and feedback is too valuable to throw away, so store every "no" and make the agent reread them.

Postique runs our channels today. A human approves every post, the diary gets a little longer every week, and unlike some colleagues, it actually remembers what I told it yesterday.

---

## ILLUSTRATION GENERATION PROMPTS (not part of the post — one per image slot above)

Style: the ian-xiaohei-illustrations skill (github.com/helloianneo/ian-xiaohei-illustrations), labels switched to English for our blog. Paste one prompt per image into ChatGPT (image mode) or Gemini / nano-banana, then save the results as `docs/blog-images/<slot-name>.png`. Every prompt below is self-contained.

**Shared preamble — start EVERY prompt with this block:**

> One standalone 16:9 horizontal article illustration. Pure white background. Minimalist black hand-drawn line art, slightly wobbly pen lines, lots of empty white space, sparse red/orange/blue handwritten English annotations, clean absurd product-sketch feeling. No gradients, no shadows, no paper texture, no infographic look, no cute mascot poster, no children's illustration, no realistic UI. Recurring character: Xiaohei, a small solid-black absurd creature with white dot eyes, tiny thin legs, blank serious deadpan expression, slightly uneven hand-drawn body; Xiaohei performs the core action, is serious and slightly bizarre, never cute. Colors: black for line art and Xiaohei, orange for flow/paths/arrows, red only for warnings/problems, blue only for secondary system notes. At most 5-8 short handwritten English labels, main subject 40-60% of canvas, at least 35% blank white space, no title in the corner, strange but clean.

**01-what-is-postique.png** — Xiaohei stands mid-frame seriously turning the crank of a small hand-cranked machine. Into its left side tumbles a messy cloud of scraps: a lightbulb, a crumpled note, a tiny photo, a squiggle labeled "trends". Out of the right side slides a neat row of small calendar cards along an orange path. At far right a large human hand holds a stamp above the cards with a red handwritten label "you approve". Other labels: "ideas", "photos", "calendar".

**02-not-a-chatbot.png** — Split contrast. Left half: a simple rectangular chat window standing on thin legs, papers leaking out of its open bottom onto the floor, red label "every chat starts over". Right half: Xiaohei walks along an orange path wearing a tiny backpack stuffed with those same papers, a small blue thought bubble above its head containing a tiny calendar. Blue label "remembers yesterday", small labels "voice" and "strategy". A thin wobbly vertical line separates the halves.

**03-slop-gate.png** — A queue of small paper drafts with little legs walks along an orange path toward a narrow gate. Xiaohei is the gatekeeper holding a large magnifying glass up to one paper. One rejected paper flies away on a red dashed arc with red label "sounds like AI". Papers past the gate walk straighter and prouder toward a label "clean". Small blue note near the gate: "counts every sentence". Another label: "rewrite".

**04-feedback-diary.png** — On the left, crumpled rejected notes (red label "rejected") fall into a small hand press; Xiaohei pushes the lever down with both arms, deadpan. One thin clean page slides out on an orange path labeled "lessons", and the path curves right to a second mini-scene: Xiaohei on a stool intently reading that page, small wall clock showing 5:45, blue label "read first" and label "5:45 am". The orange path forms an open loop.

**05-videos-are-code.png** — Xiaohei sits at a tiny desk on the left typing on a keyboard; a long thin ribbon of curly braces and angle brackets flows from the screen along an orange path into a boxy projector machine mid-frame. From the projector lens on the right comes a short film strip, its last frame a tiny phone screen with a play button. Above the machine a small blue "zzz" is crossed out. Labels: "writes code", "render", "video", blue "wakes up only for work".
